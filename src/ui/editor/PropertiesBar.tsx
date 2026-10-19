/** Second top row: settings that change rarely (song info, tempo, time, tuning, capo). */
import { Info, PencilSimple } from '@phosphor-icons/react';
import type { Position, Song } from '../../model/types';
import { MAX_TEMPO, MIN_TEMPO } from '../../model/operations';
import { findPreset, MAX_CAPO, midiToPitch, pitchClass, pitchToMidi, TUNING_PRESETS } from '../../model/tuning';
import * as cmd from '../../editor/commands';
import type { EditorAction } from '../../editor/editor';
import { Button, Divider, Segmented } from '../controls';
import { NumberField } from '../NumberField';
import { parseTs, TIME_SIGNATURES, tsKey } from './constants';

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
  onSongInfo: () => void;
  onEditTuning: () => void;
}

export function PropertiesBar({ song, cursor, dispatch, onSongInfo, onEditTuning }: Props) {
  const exec = (c: cmd.Command) => dispatch({ type: 'exec', command: c });
  const track = song.tracks[cursor.track];
  const { tuning, capo } = track.instrument;
  const preset = findPreset(tuning);
  const { artist, composer } = song.meta;
  const summary = [artist, composer && `music by ${composer}`].filter(Boolean).join(', ');

  const setStrings = (count: number) => {
    if (count === tuning.length) return;
    if (count > tuning.length) {
      const next = [...tuning];
      while (next.length < count) next.push(midiToPitch((pitchToMidi(next[next.length - 1]) ?? 40) - 5));
      exec(cmd.setTuning(cursor.track, next));
    } else {
      const hasNotes = track.measures.some((m) => m.beats.some((b) => b.notes.some((n) => n.string >= count)));
      if (hasNotes && !window.confirm('Notes on the removed string will be deleted. Continue?')) return;
      exec(cmd.setTuning(cursor.track, tuning.slice(0, count)));
    }
  };

  return (
    <div className="h-10 shrink-0 flex items-center gap-2 px-2 border-b border-line bg-bg100 overflow-x-auto">
      <Button variant="ghost" icon={Info} onClick={onSongInfo} tip="Title, artist, composer, copyright and watermark" className="max-w-[300px]">
        <span className="truncate">{summary || 'Add artist, composer...'}</span>
      </Button>
      <Divider />
      <label className="flex items-center gap-1.5" data-tip={`Written tempo, ${MIN_TEMPO} to ${MAX_TEMPO} BPM`}>
        <span className="label">Tempo</span>
        <NumberField className="field w-14 font-mono" value={song.tempo} min={MIN_TEMPO} max={MAX_TEMPO} onCommit={(v) => exec(cmd.setTempo(v))} ariaLabel="Tempo in BPM" />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="label">Time</span>
        <select className="field font-mono" value={tsKey(song.timeSignature)} onChange={(e) => exec(cmd.setTimeSignature(parseTs(e.target.value)))} aria-label="Time signature" data-tip="Time signature of the song">
          {!TIME_SIGNATURES.some((t) => tsKey(t) === tsKey(song.timeSignature)) && <option value={tsKey(song.timeSignature)}>{tsKey(song.timeSignature)}</option>}
          {TIME_SIGNATURES.map((t) => (
            <option key={tsKey(t)} value={tsKey(t)}>
              {tsKey(t)}
            </option>
          ))}
        </select>
      </label>
      <Divider />
      <span className="label whitespace-nowrap" data-tip="These settings apply to the selected track">
        {track.name}
      </span>
      <select
        className="field w-36"
        value={preset?.id ?? 'custom'}
        onChange={(e) => {
          const p = TUNING_PRESETS.find((x) => x.id === e.target.value);
          if (!p) return;
          if (p.tuning.length < tuning.length && !window.confirm('Notes on the removed string will be deleted. Continue?')) return;
          exec(cmd.setTuning(cursor.track, p.tuning));
        }}
        aria-label="Tuning"
        data-tip={`Tuning, low to high: ${[...tuning].reverse().map(pitchClass).join(' ')}`}
      >
        {!preset && (
          <option value="custom" disabled>
            Custom tuning
          </option>
        )}
        {TUNING_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button variant="ghost" icon={PencilSimple} onClick={onEditTuning} tip="Tune each string" />
      <Segmented
        label="Strings"
        value={tuning.length}
        onChange={setStrings}
        options={[
          { value: 6, label: '6', tip: '6-string guitar' },
          { value: 7, label: '7', tip: '7-string guitar' },
        ]}
      />
      <select className="field" value={capo} onChange={(e) => exec(cmd.setCapo(cursor.track, Number(e.target.value)))} aria-label="Capo" data-tip="Capo position">
        {Array.from({ length: MAX_CAPO + 1 }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? 'No capo' : `Capo ${i}`}
          </option>
        ))}
      </select>
    </div>
  );
}
