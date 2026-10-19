import type { Song, TimeSignature } from '../model/types';
import { findPreset, TUNING_PRESETS } from '../model/tuning';
import { MAX_TEMPO, MIN_TEMPO } from '../model/operations';
import * as cmd from '../editor/commands';
import type { EditorAction } from '../editor/editor';
import { canRedo, canUndo, type History } from '../editor/history';
import { Icon } from './icons';
import { NumberField } from './NumberField';

export const TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

export const tsKey = (ts: TimeSignature) => `${ts.numerator}/${ts.denominator}`;

interface Props {
  song: Song;
  track: number;
  history: History;
  dirty: boolean;
  dispatch: (a: EditorAction) => void;
  onSave: () => void;
  onExport: () => void;
  onProjects: () => void;
}

export function Toolbar({ song, track, history, dirty, dispatch, onSave, onExport, onProjects }: Props) {
  const tuning = song.tracks[track].instrument.tuning;
  const preset = findPreset(tuning);
  const exec = (command: cmd.Command) => dispatch({ type: 'exec', command });
  const lastUndo = history.past[history.past.length - 1];
  const lastRedo = history.future[history.future.length - 1];

  return (
    <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-line bg-bg100">
      <button className="btn btn-ghost btn-icon" title="Projects (open, new, import)" aria-label="Projects" onClick={onProjects}>
        {Icon.folder}
      </button>
      <input
        className="field w-56 font-semibold text-[15px] bg-transparent border-transparent hover:border-line"
        value={song.meta.title}
        onChange={(e) => exec(cmd.setMeta({ title: e.target.value }))}
        aria-label="Song title"
        title="Song title"
        maxLength={120}
      />
      <span className={`text-[11px] w-16 ${dirty ? 'text-muted' : 'text-success'}`} aria-live="polite">
        {dirty ? 'Unsaved' : 'Saved'}
      </span>

      <div className="h-6 w-px bg-line mx-1" />
      <button className="btn btn-ghost btn-icon" disabled={!canUndo(history)} onClick={() => dispatch({ type: 'undo' })} title={`Undo${lastUndo ? `: ${lastUndo.label}` : ''} (Ctrl+Z)`} aria-label="Undo">
        {Icon.undo}
      </button>
      <button className="btn btn-ghost btn-icon" disabled={!canRedo(history)} onClick={() => dispatch({ type: 'redo' })} title={`Redo${lastRedo ? `: ${lastRedo.label}` : ''} (Ctrl+Shift+Z)`} aria-label="Redo">
        {Icon.redo}
      </button>

      <div className="h-6 w-px bg-line mx-1" />
      <label className="flex items-center gap-1.5" title={`Tempo in beats per minute (${MIN_TEMPO}–${MAX_TEMPO})`}>
        <span className="label">Tempo</span>
        <NumberField className="field w-16 font-mono" value={song.tempo} min={MIN_TEMPO} max={MAX_TEMPO} onCommit={(v) => exec(cmd.setTempo(v))} ariaLabel="Tempo (BPM)" />
        <span className="text-[11px] text-muted">BPM</span>
      </label>
      <label className="flex items-center gap-1.5" title="Time signature of the song (add changes per measure in the right panel)">
        <span className="label">Time</span>
        <select
          className="field font-mono"
          value={tsKey(song.timeSignature)}
          onChange={(e) => {
            const [n, d] = e.target.value.split('/').map(Number);
            exec(cmd.setTimeSignature({ numerator: n, denominator: d as TimeSignature['denominator'] }));
          }}
          aria-label="Time signature"
        >
          {!TIME_SIGNATURES.some((t) => tsKey(t) === tsKey(song.timeSignature)) && <option value={tsKey(song.timeSignature)}>{tsKey(song.timeSignature)}</option>}
          {TIME_SIGNATURES.map((t) => (
            <option key={tsKey(t)} value={tsKey(t)}>
              {tsKey(t)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5" title="Tuning of the selected track (edit strings individually in the left panel)">
        <span className="label">Tuning</span>
        <select
          className="field w-40"
          value={preset?.id ?? 'custom'}
          onChange={(e) => {
            const p = TUNING_PRESETS.find((x) => x.id === e.target.value);
            if (!p) return;
            if (p.tuning.length < tuning.length && !window.confirm('Switching to fewer strings deletes notes on the removed string. Continue?')) return;
            exec(cmd.setTuning(track, p.tuning));
          }}
          aria-label="Tuning preset"
        >
          {!preset && (
            <option value="custom" disabled>
              Custom
            </option>
          )}
          {TUNING_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex-1" />
      <button className="btn" onClick={onSave} title="Save to this browser (Ctrl+S)">
        {Icon.save} Save
      </button>
      <button className="btn btn-primary" onClick={onExport} title="Print preview and PDF export (Ctrl+P)">
        {Icon.pdf} Export PDF
      </button>
    </header>
  );
}
