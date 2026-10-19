import type { DurationValue, HarmonicType, NoteTechniques, Position, SlideType, Song, TimeSignature } from '../model/types';
import { durationName, effectiveTimeSignatures } from '../model/duration';
import { findNote } from '../model/operations';
import { MAX_FRET, pitchClass } from '../model/tuning';
import * as cmd from '../editor/commands';
import type { BooleanTechnique, EditorAction } from '../editor/editor';
import { measureFill } from '../editor/editor';
import { Icon } from './icons';
import { NumberField } from './NumberField';
import { TIME_SIGNATURES, tsKey } from './Toolbar';

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
}

const DURATIONS: { value: DurationValue; label: string; key: string }[] = [
  { value: 1, label: '1', key: 'Whole' },
  { value: 2, label: '2', key: 'Half' },
  { value: 4, label: '4', key: 'Quarter' },
  { value: 8, label: '8', key: 'Eighth' },
  { value: 16, label: '16', key: 'Sixteenth' },
];

const TOGGLES: { key: BooleanTechnique; label: string; shortcut: string; hint: string }[] = [
  { key: 'legato', label: 'H/P', shortcut: 'H', hint: 'Hammer-on / pull-off to the next note on this string' },
  { key: 'vibrato', label: 'Vibrato', shortcut: 'V', hint: 'Vibrato' },
  { key: 'palmMute', label: 'P.M.', shortcut: 'P', hint: 'Palm mute' },
  { key: 'letRing', label: 'Let ring', shortcut: 'L', hint: 'Let ring' },
  { key: 'tapped', label: 'Tap', shortcut: 'T', hint: 'Tapped note' },
  { key: 'ghost', label: 'Ghost', shortcut: 'G', hint: 'Ghost note, shown in parentheses' },
  { key: 'dead', label: 'Dead', shortcut: 'X', hint: 'Dead (muted) note, shown as x' },
  { key: 'tie', label: 'Tie', shortcut: 'Shift+T', hint: 'Tied to the previous note on this string' },
];

export function RightSidebar({ song, cursor, dispatch }: Props) {
  const track = song.tracks[cursor.track];
  const beat = track.measures[cursor.measure].beats[cursor.beat];
  const note = findNote(song, cursor);
  const tech: NoteTechniques = note?.techniques ?? {};
  const fill = measureFill(song, cursor.track, cursor.measure);
  const ts = effectiveTimeSignatures(song)[cursor.measure];
  const tsChange = song.masterBars[cursor.measure].timeSignature;
  const set = <K extends keyof NoteTechniques>(key: K, value: NoteTechniques[K] | undefined) => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, key, value) });

  return (
    <aside className="w-[248px] shrink-0 border-l border-line bg-bg100 overflow-y-auto" aria-label="Note properties">
      <section className="p-3 flex flex-col gap-2.5 border-b border-line">
        <h2 className="heading">Note</h2>
        <div className="text-xs text-muted">
          Measure {cursor.measure + 1} · Beat {cursor.beat + 1} · String {cursor.string + 1} ({pitchClass(track.instrument.tuning[cursor.string])})
        </div>
        <div className="flex items-center gap-2">
          <label className="label" htmlFor="fret">
            Fret
          </label>
          <NumberField
            className="field w-16 font-mono"
            value={note ? note.fret : null}
            min={0}
            max={MAX_FRET}
            placeholder="—"
            onCommit={(v) => dispatch({ type: 'setFret', fret: v })}
            ariaLabel="Fret number"
          />
          <button className="btn" disabled={!note} onClick={() => dispatch({ type: 'deleteNote' })} title="Delete note (Delete)">
            {Icon.trash} Delete
          </button>
        </div>
        <p className="text-[11px] leading-4 text-muted">
          Click a string on the sheet, then type <span className="kbd">0</span>–<span className="kbd">9</span>. Two quick digits enter 10–{MAX_FRET}.
        </p>
      </section>

      <section className="p-3 flex flex-col gap-2.5 border-b border-line">
        <h2 className="heading">Duration</h2>
        <div className="flex items-center gap-2">
          <div className="seg" role="group" aria-label="Duration">
            {DURATIONS.map((d) => (
              <button key={d.value} aria-pressed={beat.duration.value === d.value} onClick={() => dispatch({ type: 'setDuration', value: d.value })} title={`${d.key} (+ / − to change)`}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="seg">
            <button aria-pressed={beat.duration.dotted} onClick={() => dispatch({ type: 'toggleDot' })} title="Dotted (.)" aria-label="Dotted">
              •
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted flex-1">{beat.notes.length === 0 ? `${durationName(beat.duration)} rest` : durationName(beat.duration)}</span>
          <button className="btn" disabled={beat.notes.length === 0} onClick={() => dispatch({ type: 'makeRest' })} title="Clear the beat's notes so it becomes a rest (R)">
            Make rest
          </button>
        </div>
        <div className="flex gap-1.5">
          <button className="btn flex-1 justify-center" onClick={() => dispatch({ type: 'insertBeat' })} title="Insert a beat before the cursor (I)">
            Insert beat
          </button>
          <button className="btn flex-1 justify-center" onClick={() => dispatch({ type: 'deleteBeat' })} title="Delete this beat (Shift+Delete)">
            Delete beat
          </button>
        </div>
      </section>

      <section className="p-3 flex flex-col gap-2.5 border-b border-line">
        <h2 className="heading">Techniques</h2>
        {!note && <p className="text-[11px] text-muted">Select a note to apply techniques.</p>}
        <div className="grid grid-cols-2 gap-1.5">
          {TOGGLES.map((t) => (
            <button key={t.key} className="btn justify-between" disabled={!note} aria-pressed={!!tech[t.key]} onClick={() => dispatch({ type: 'toggleTechnique', key: t.key })} title={`${t.hint} (${t.shortcut})`}>
              {t.label}
              <span className="kbd">{t.shortcut}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="label w-16">Slide</span>
          <select className="field flex-1" disabled={!note} value={tech.slide ?? ''} onChange={(e) => set('slide', (e.target.value || undefined) as SlideType | undefined)} title="Slide (S toggles slide to next note)">
            <option value="">None</option>
            <option value="legato">To next note</option>
            <option value="up">Slide out up</option>
            <option value="down">Slide out down</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="label w-16">Bend</span>
          <select className="field flex-1" disabled={!note} value={tech.bend ?? 0} onChange={(e) => set('bend', Number(e.target.value) || undefined)} title="Bend amount (B toggles a full bend)">
            <option value={0}>None</option>
            <option value={1}>½ step</option>
            <option value={2}>Full</option>
            <option value={3}>1½ steps</option>
            <option value={4}>2 steps</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pl-[72px]">
          <input type="checkbox" disabled={!note || !tech.bend} checked={!!tech.bendRelease} onChange={(e) => set('bendRelease', e.target.checked || undefined)} />
          <span className="text-xs">Release</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="label w-16">Harmonic</span>
          <select className="field flex-1" disabled={!note} value={tech.harmonic ?? ''} onChange={(e) => set('harmonic', (e.target.value || undefined) as HarmonicType | undefined)} title="Harmonic (N toggles natural)">
            <option value="">None</option>
            <option value="natural">Natural</option>
            <option value="artificial">Artificial (A.H.)</option>
          </select>
        </label>
      </section>

      <section className="p-3 flex flex-col gap-2.5">
        <h2 className="heading">Measure {cursor.measure + 1}</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted flex-1">
            {tsKey(ts)} · {fill.used === fill.capacity ? 'Full' : fill.used > fill.capacity ? 'Too long' : `${Math.round((fill.used / fill.capacity) * 100)}% filled`}
          </span>
          <div className="h-1.5 w-20 rounded-full bg-bg300 overflow-hidden" aria-hidden="true">
            <div className="h-full" style={{ width: `${Math.min(100, (fill.used / fill.capacity) * 100)}%`, background: fill.used > fill.capacity ? 'var(--danger)' : 'var(--accent)' }} />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <span className="label flex-1">Time signature change</span>
          <select
            className="field font-mono w-24"
            value={tsChange ? tsKey(tsChange) : ''}
            onChange={(e) => {
              if (!e.target.value) return dispatch({ type: 'exec', command: cmd.setMeasureTimeSignature(cursor.measure, null) });
              const [n, d] = e.target.value.split('/').map(Number);
              dispatch({ type: 'exec', command: cmd.setMeasureTimeSignature(cursor.measure, { numerator: n, denominator: d as TimeSignature['denominator'] }) });
            }}
            title="Change the time signature from this measure on"
          >
            <option value="">None</option>
            {TIME_SIGNATURES.map((t) => (
              <option key={tsKey(t)} value={tsKey(t)}>
                {tsKey(t)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn justify-center" onClick={() => dispatch({ type: 'insertMeasure', after: false })} title="Insert measure before (Ctrl+Shift+Enter)">
            Insert before
          </button>
          <button className="btn justify-center" onClick={() => dispatch({ type: 'insertMeasure', after: true })} title="Insert measure after (Ctrl+Enter)">
            Insert after
          </button>
          <button className="btn justify-center" disabled={cursor.measure === 0} onClick={() => dispatch({ type: 'moveMeasure', dir: -1 })} title="Move measure left (Ctrl+Alt+←)">
            {Icon.left} Move
          </button>
          <button className="btn justify-center" disabled={cursor.measure >= song.masterBars.length - 1} onClick={() => dispatch({ type: 'moveMeasure', dir: 1 })} title="Move measure right (Ctrl+Alt+→)">
            Move {Icon.right}
          </button>
          <button className="btn justify-center" onClick={() => dispatch({ type: 'exec', command: cmd.clearMeasure(cursor.track, cursor.measure), cursor: { ...cursor, beat: 0 } })} title="Remove all notes from this measure in this track">
            Clear
          </button>
          <button className="btn btn-danger justify-center" onClick={() => dispatch({ type: 'deleteMeasure' })} title="Delete measure in all tracks (Ctrl+Delete)">
            Delete
          </button>
        </div>
      </section>
    </aside>
  );
}
