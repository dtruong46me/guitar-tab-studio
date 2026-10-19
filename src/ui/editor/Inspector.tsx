/** Right panel: what is selected (note, beat, measure) and the actions that apply to it. */
import { ArrowLeft, ArrowLineLeft, ArrowLineRight, ArrowRight, Eraser, Trash } from '@phosphor-icons/react';
import type { Position, Song } from '../../model/types';
import { durationName, effectiveTimeSignatures, TICKS_PER_QUARTER } from '../../model/duration';
import { findNote } from '../../model/operations';
import { MAX_FRET, midiToPitch, notePitch, pitchClass } from '../../model/tuning';
import * as cmd from '../../editor/commands';
import { measureFill, type EditorAction } from '../../editor/editor';
import { Button } from '../controls';
import { NumberField } from '../NumberField';
import { parseTs, TIME_SIGNATURES, tsKey } from './constants';
import { PanelSection } from './PanelSection';

const TECHNIQUE_NAMES: Record<string, string> = {
  prebend: 'pre-bend',
  slap: 'slap',
  pop: 'pop',
  accent: 'accent',
  staccato: 'staccato',
  grace: 'grace note',
  trill: 'trill',
  tremolo: 'tremolo',
  fadeIn: 'fade in',
  legato: 'hammer/pull',
  slide: 'slide',
  bend: 'bend',
  vibrato: 'vibrato',
  palmMute: 'palm mute',
  letRing: 'let ring',
  harmonic: 'harmonic',
  tapped: 'tap',
  ghost: 'ghost',
  tie: 'tie',
  dead: 'dead',
};

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
  collapsed: string[];
  onToggle: (id: string) => void;
}

export function Inspector({ song, cursor, dispatch, collapsed, onToggle }: Props) {
  const track = song.tracks[cursor.track];
  const beat = track.measures[cursor.measure].beats[cursor.beat];
  const note = findNote(song, cursor);
  const stringName = pitchClass(track.instrument.tuning[cursor.string]);
  const pitch = note ? midiToPitch(notePitch(track.instrument.tuning, track.instrument.capo, cursor.string, note.fret)) : null;
  const techniques = note ? Object.keys(note.techniques).filter((k) => k !== 'bendRelease').map((k) => TECHNIQUE_NAMES[k] ?? k) : [];

  const ts = effectiveTimeSignatures(song)[cursor.measure];
  const change = song.masterBars[cursor.measure].timeSignature;
  const fill = measureFill(song, cursor.track, cursor.measure);
  const beatTicks = (TICKS_PER_QUARTER * 4) / ts.denominator;
  const diff = (fill.capacity - fill.used) / beatTicks;
  const fmt = (n: number) => `${+Math.abs(n).toFixed(2)} beat${Math.abs(n) === 1 ? '' : 's'}`;
  const fillText = diff === 0 ? 'Full' : diff > 0 ? `${fmt(diff)} left` : `${fmt(diff)} too long`;

  return (
    <aside className="w-[248px] shrink-0 border-l border-line bg-bg100 flex flex-col" aria-label="Selection">
      <div className="h-9 shrink-0 flex items-center px-3 border-b border-line">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Selection</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <PanelSection id="i-note" title="Note" meta={`${stringName} string`} collapsed={collapsed.includes('i-note')} onToggle={() => onToggle('i-note')}>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="label">Fret</span>
              <NumberField className="field w-14 font-mono" value={note ? note.fret : null} min={0} max={MAX_FRET} placeholder="-" onCommit={(v) => dispatch({ type: 'setFret', fret: v })} ariaLabel="Fret number" />
            </label>
            {pitch && (
              <span className="text-xs text-muted" data-tip="Sounding pitch, including capo">
                sounds <span className="font-mono text-ink">{pitch}</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted mt-2 leading-4">
            {note ? (techniques.length ? `Techniques: ${techniques.join(', ')}` : 'No techniques. Pick them in the Tools panel.') : 'No note here. Type a fret number or click one in the Tools panel.'}
          </p>
          {note && (note.techniques.grace !== undefined || note.techniques.trill !== undefined) && (
            <div className="flex items-center gap-3 mt-2">
              {note.techniques.grace !== undefined && (
                <label className="flex items-center gap-1.5">
                  <span className="label">Grace fret</span>
                  <NumberField className="field w-12 font-mono" value={note.techniques.grace} min={0} max={MAX_FRET} onCommit={(v) => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, 'grace', v) })} ariaLabel="Grace note fret" />
                </label>
              )}
              {note.techniques.trill !== undefined && (
                <label className="flex items-center gap-1.5">
                  <span className="label">Trill fret</span>
                  <NumberField className="field w-12 font-mono" value={note.techniques.trill} min={0} max={MAX_FRET} onCommit={(v) => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, 'trill', v) })} ariaLabel="Trill fret" />
                </label>
              )}
            </div>
          )}
        </PanelSection>

        <PanelSection id="i-beat" title={`Beat ${cursor.beat + 1}`} meta={beat.rest ? 'rest' : `${beat.notes.length} note${beat.notes.length === 1 ? '' : 's'}`} collapsed={collapsed.includes('i-beat')} onToggle={() => onToggle('i-beat')}>
          <p className="text-xs">
            {durationName(beat.duration)}
            {beat.rest ? ' rest' : ''}
          </p>
          <p className="text-[11px] text-muted mt-1 leading-4">{beat.notes.length === 0 && !beat.rest ? 'Empty beats print as blank space. Press R for a written rest.' : `Beat ${cursor.beat + 1} of ${track.measures[cursor.measure].beats.length} in this measure.`}</p>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 mt-2">
            <span className="label">Chord</span>
            <input
              className="field h-7 font-semibold"
              value={beat.chord ?? ''}
              maxLength={16}
              placeholder="e.g. Am7"
              onChange={(e) => dispatch({ type: 'setBeatProps', patch: { chord: e.target.value } })}
              onBlur={(e) => e.target.value !== e.target.value.trim() && dispatch({ type: 'setBeatProps', patch: { chord: e.target.value.trim() } })}
              aria-label="Chord name"
            />
            <span className="label">Text</span>
            <input
              className="field h-7"
              value={beat.text ?? ''}
              maxLength={40}
              placeholder="e.g. Chorus"
              onChange={(e) => dispatch({ type: 'setBeatProps', patch: { text: e.target.value } })}
              aria-label="Text above the staff"
            />
          </div>
          {(beat.stroke || beat.dynamic) && (
            <p className="text-[11px] text-muted mt-1.5">{[beat.stroke && `Strum ${beat.stroke}`, beat.dynamic && `Dynamics ${beat.dynamic}`].filter(Boolean).join(', ')}</p>
          )}
        </PanelSection>

        <PanelSection id="i-measure" title={`Measure ${cursor.measure + 1}`} meta={`${tsKey(ts)}, ${fillText.toLowerCase()}`} collapsed={collapsed.includes('i-measure')} onToggle={() => onToggle('i-measure')}>
          <label className="flex flex-col gap-1">
            <span className="label">Time signature from here</span>
            <select
              className="field font-mono"
              value={change ? tsKey(change) : ''}
              onChange={(e) => dispatch({ type: 'exec', command: cmd.setMeasureTimeSignature(cursor.measure, e.target.value ? parseTs(e.target.value) : null) })}
            >
              <option value="">{`No change (${tsKey(ts)})`}</option>
              {TIME_SIGNATURES.map((t) => (
                <option key={tsKey(t)} value={tsKey(t)}>
                  {tsKey(t)}
                </option>
              ))}
            </select>
          </label>
          <p className={`text-[11px] mt-1.5 ${diff < 0 ? 'text-danger' : 'text-muted'}`}>{fillText}</p>
          <div className="grid grid-cols-2 gap-1 mt-2">
            <Button icon={ArrowLineLeft} keepFocus onClick={() => dispatch({ type: 'insertMeasure', after: false })} tip="Insert a measure before" shortcut="Ctrl+Shift+Enter">
              Add before
            </Button>
            <Button icon={ArrowLineRight} keepFocus onClick={() => dispatch({ type: 'insertMeasure', after: true })} tip="Insert a measure after" shortcut="Ctrl+Enter">
              Add after
            </Button>
            <Button icon={ArrowLeft} keepFocus disabled={cursor.measure === 0} onClick={() => dispatch({ type: 'moveMeasure', dir: -1 })} tip="Move measure left" shortcut="Ctrl+Alt+Left">
              Move
            </Button>
            <Button icon={ArrowRight} keepFocus disabled={cursor.measure >= song.masterBars.length - 1} onClick={() => dispatch({ type: 'moveMeasure', dir: 1 })} tip="Move measure right" shortcut="Ctrl+Alt+Right">
              Move
            </Button>
            <Button icon={Eraser} keepFocus onClick={() => dispatch({ type: 'exec', command: cmd.clearMeasure(cursor.track, cursor.measure), cursor: { ...cursor, beat: 0 } })} tip="Remove every note in this measure (this track)">
              Clear
            </Button>
            <Button variant="danger" icon={Trash} keepFocus onClick={() => dispatch({ type: 'deleteMeasure' })} tip="Delete this measure in every track" shortcut="Ctrl+Delete">
              Delete
            </Button>
          </div>
        </PanelSection>
      </div>
    </aside>
  );
}
