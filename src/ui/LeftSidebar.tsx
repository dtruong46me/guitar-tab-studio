import { useState } from 'react';
import type { Song, SongMeta } from '../model/types';
import { MAX_CAPO, pitchOptions, pitchToMidi, midiToPitch } from '../model/tuning';
import * as cmd from '../editor/commands';
import type { EditorAction } from '../editor/editor';
import { Icon } from './icons';

const PITCHES = pitchOptions();

interface Props {
  song: Song;
  track: number;
  dispatch: (a: EditorAction) => void;
}

export function LeftSidebar({ song, track, dispatch }: Props) {
  const exec = (command: cmd.Command) => dispatch({ type: 'exec', command });
  const t = song.tracks[track];
  const { tuning, capo } = t.instrument;

  const setStringCount = (count: number) => {
    if (count === tuning.length) return;
    if (count > tuning.length) {
      // Add strings below the lowest one, a fourth apart (e.g. low B on a 7-string).
      const next = [...tuning];
      while (next.length < count) next.push(midiToPitch((pitchToMidi(next[next.length - 1]) ?? 40) - 5));
      exec(cmd.setTuning(track, next));
    } else {
      const removed = tuning.slice(count);
      const hasNotes = t.measures.some((m) => m.beats.some((b) => b.notes.some((n) => n.string >= count)));
      if (hasNotes && !window.confirm(`Notes on the ${removed.join(', ')} string will be deleted. Continue?`)) return;
      exec(cmd.setTuning(track, tuning.slice(0, count)));
    }
  };

  const metaField = (key: keyof SongMeta, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input className="field" value={song.meta[key]} placeholder={placeholder} maxLength={120} onChange={(e) => exec(cmd.setMeta({ [key]: e.target.value }))} />
    </label>
  );

  return (
    <aside className="w-[248px] shrink-0 border-r border-line bg-bg100 overflow-y-auto" aria-label="Project and instrument">
      <section className="p-3 flex flex-col gap-2.5 border-b border-line">
        <h2 className="heading">Project</h2>
        {metaField('title', 'Title', 'Untitled')}
        {metaField('artist', 'Artist', 'Artist name')}
        {metaField('album', 'Album', 'Optional')}
        {metaField('tabbedBy', 'Tabbed by', 'Your name')}
      </section>

      <section className="p-3 flex flex-col gap-2.5 border-b border-line">
        <h2 className="heading">Instrument</h2>
        <div className="flex items-center justify-between">
          <span className="label">Strings</span>
          <div className="seg" role="group" aria-label="Number of strings">
            {[6, 7].map((n) => (
              <button key={n} aria-pressed={tuning.length === n} onClick={() => setStringCount(n)} title={`${n}-string guitar`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="capo">
            Capo
          </label>
          <div className="flex items-center gap-1.5">
            <select id="capo" className="field font-mono w-24" value={capo} onChange={(e) => exec(cmd.setCapo(track, Number(e.target.value)))}>
              {Array.from({ length: MAX_CAPO + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'None' : `Fret ${i}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label">Tuning (high → low)</span>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
            {tuning.map((p, i) => (
              <TuningRow
                key={i}
                index={i}
                pitch={p}
                onChange={(np) => {
                  const next = [...tuning];
                  next[i] = np;
                  exec(cmd.setTuning(track, next));
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <TrackList song={song} track={track} dispatch={dispatch} />
    </aside>
  );
}

function TuningRow({ index, pitch, onChange }: { index: number; pitch: string; onChange: (p: string) => void }) {
  const midi = pitchToMidi(pitch) ?? 40;
  return (
    <>
      <span className="text-[11px] text-muted font-mono w-4 text-right">{index + 1}</span>
      <div className="flex gap-1">
        <button className="btn btn-icon h-6 w-6" title="Tune down a semitone" aria-label={`Tune string ${index + 1} down`} onClick={() => onChange(midiToPitch(midi - 1))} disabled={midi <= 23}>
          {Icon.minus}
        </button>
        <select className="field h-6 flex-1 font-mono text-xs" value={pitch} onChange={(e) => onChange(e.target.value)} aria-label={`String ${index + 1} pitch`}>
          {!PITCHES.includes(pitch) && <option value={pitch}>{pitch}</option>}
          {PITCHES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn btn-icon h-6 w-6" title="Tune up a semitone" aria-label={`Tune string ${index + 1} up`} onClick={() => onChange(midiToPitch(midi + 1))} disabled={midi >= 76}>
          {Icon.plus}
        </button>
      </div>
    </>
  );
}

function TrackList({ song, track, dispatch }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const exec = (command: cmd.Command) => dispatch({ type: 'exec', command });

  const commitRename = () => {
    if (editing !== null && draft.trim()) exec(cmd.renameTrack(editing, draft));
    setEditing(null);
  };

  return (
    <section className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="heading">Tracks</h2>
        <button
          className="btn btn-ghost btn-icon h-6 w-6"
          title="Add a track with the same tuning"
          aria-label="Add track"
          onClick={() => {
            exec(cmd.addTrack(`Guitar ${song.tracks.length + 1}`));
            dispatch({ type: 'selectTrack', track: song.tracks.length });
          }}
        >
          {Icon.plus}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {song.tracks.map((t, i) => (
          <li key={t.id} className={`group flex items-center gap-1 rounded-md pl-2 pr-1 h-8 border ${i === track ? 'border-accent bg-bg200' : 'border-transparent hover:bg-bg200'}`}>
            {editing === i ? (
              <input
                autoFocus
                className="field h-6 flex-1"
                value={draft}
                maxLength={60}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(null);
                }}
                aria-label="Track name"
              />
            ) : (
              <button className="flex-1 text-left truncate text-[13px]" onClick={() => dispatch({ type: 'selectTrack', track: i })} onDoubleClick={() => (setEditing(i), setDraft(t.name))} title="Select track (double-click to rename)">
                {t.name}
                <span className="ml-1.5 text-[11px] text-muted">{t.instrument.tuning.length}-str</span>
              </button>
            )}
            <button className="btn btn-ghost btn-icon h-6 w-6 opacity-60 group-hover:opacity-100" title="Rename track" aria-label={`Rename ${t.name}`} onClick={() => (setEditing(i), setDraft(t.name))}>
              {Icon.edit}
            </button>
            <button
              className="btn btn-ghost btn-icon h-6 w-6 opacity-60 group-hover:opacity-100"
              title={song.tracks.length > 1 ? 'Delete track' : 'A song needs at least one track'}
              aria-label={`Delete ${t.name}`}
              disabled={song.tracks.length <= 1}
              onClick={() => {
                if (!window.confirm(`Delete track "${t.name}"?`)) return;
                exec(cmd.removeTrack(i));
                dispatch({ type: 'selectTrack', track: Math.max(0, Math.min(track, song.tracks.length - 2)) });
              }}
            >
              {Icon.trash}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

