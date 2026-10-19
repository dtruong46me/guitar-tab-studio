/**
 * Left panel: the tools used every few seconds while writing (frets, durations, techniques, beat
 * editing). Groups can be collapsed, hidden and reordered; the arrangement is remembered.
 */
import { useState } from 'react';
import { ArrowCounterClockwise, Check, SlidersHorizontal } from '@phosphor-icons/react';
import type { Dynamic, DurationValue, NoteTechniques, Position, Song } from '../../model/types';
import { durationName } from '../../model/duration';
import { findNote } from '../../model/operations';
import { pitchClass } from '../../model/tuning';
import * as cmd from '../../editor/commands';
import type { BooleanTechnique, EditorAction } from '../../editor/editor';
import { Button } from '../controls';
import { PanelSection, ToolButton } from './PanelSection';
import type { ToolSection, usePanelPrefs } from './panelPrefs';

const TITLES: Record<ToolSection, string> = {
  frets: 'Fret',
  duration: 'Duration',
  chord: 'Chords & strumming',
  connect: 'Legato & slides',
  bend: 'Bend',
  expression: 'Expression',
  articulation: 'Articulation',
  beat: 'Beat',
};

const DYNAMIC_OPTIONS: Dynamic[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

const DURATIONS: { value: DurationValue; label: string; key: string }[] = [
  { value: 1, label: '1', key: 'Shift+1' },
  { value: 2, label: '1/2', key: 'Shift+2' },
  { value: 4, label: '1/4', key: 'Shift+3' },
  { value: 8, label: '1/8', key: 'Shift+4' },
  { value: 16, label: '1/16', key: 'Shift+5' },
];

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
  panel: ReturnType<typeof usePanelPrefs>;
  onChord: () => void;
}

export function ToolPalette({ song, cursor, dispatch, panel, onChord }: Props) {
  const [customizing, setCustomizing] = useState(false);
  const { prefs } = panel;
  const track = song.tracks[cursor.track];
  const beat = track.measures[cursor.measure].beats[cursor.beat];
  const note = findNote(song, cursor);
  const tech: NoteTechniques = note?.techniques ?? {};
  const stringName = pitchClass(track.instrument.tuning[cursor.string]);
  const toggle = (key: BooleanTechnique) => dispatch({ type: 'toggleTechnique', key });
  const set = <K extends keyof NoteTechniques>(key: K, value: NoteTechniques[K] | undefined) => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, key, tech[key] === value ? undefined : value) });
  const noNote = !note;

  const body: Record<ToolSection, React.ReactNode> = {
    frets: (
      <>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label={`Fret on ${stringName} string`}>
          {Array.from({ length: 25 }, (_, f) => (
            <button
              key={f}
              type="button"
              className="btn h-7 px-0 font-mono text-[12px]"
              aria-pressed={note?.fret === f && !tech.dead}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => dispatch({ type: 'setFret', fret: f })}
              data-tip={`Fret ${f} on the ${stringName} string`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <ToolButton label="Dead (x)" shortcut="X" tip="Dead note or percussive string hit. Works on an empty string." pressed={!!tech.dead} onClick={() => toggle('dead')} />
          <ToolButton label="Delete" shortcut="Del" tip="Delete note" disabled={noNote} onClick={() => dispatch({ type: 'deleteNote' })} />
        </div>
      </>
    ),
    duration: (
      <>
        <div className="grid grid-cols-5 gap-1" role="group" aria-label="Duration">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className="btn h-8 px-0 font-mono text-[12px]"
              aria-pressed={beat.duration.value === d.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => dispatch({ type: 'setDuration', value: d.value })}
              data-tip={durationName({ value: d.value, dotted: false })}
              data-kbd={d.key}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <ToolButton label="Dotted" shortcut="." tip="1.5 times as long" pressed={beat.duration.dotted} onClick={() => dispatch({ type: 'toggleDot' })} />
          <ToolButton label="Rest" shortcut="R" tip="Written rest (clears the beat)" pressed={!!beat.rest} onClick={() => dispatch({ type: 'makeRest' })} />
        </div>
      </>
    ),
    chord: (
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-1">
          <ToolButton label={beat.chord ? `Chord: ${beat.chord}` : 'Add chord'} shortcut="C" tip="Chord name above this beat" pressed={!!beat.chord} onClick={onChord} className="col-span-2" />
          <ToolButton label="Strum down" shortcut="D" tip="Downstroke: low to high strings" pressed={beat.stroke === 'down'} onClick={() => dispatch({ type: 'toggleStroke', dir: 'down' })} />
          <ToolButton label="Strum up" shortcut="U" tip="Upstroke: high to low strings" pressed={beat.stroke === 'up'} onClick={() => dispatch({ type: 'toggleStroke', dir: 'up' })} />
        </div>
        <div className="grid grid-cols-6 gap-0.5" role="group" aria-label="Dynamics">
          {DYNAMIC_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className="btn h-7 px-0 italic font-semibold"
              aria-pressed={beat.dynamic === d}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => dispatch({ type: 'setBeatProps', patch: { dynamic: beat.dynamic === d ? undefined : d } })}
              data-tip={`Dynamics ${d}: applies from this beat on`}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          className="field h-7 text-xs"
          placeholder="Section text, e.g. Intro"
          maxLength={40}
          value={beat.text ?? ''}
          onChange={(e) => dispatch({ type: 'setBeatProps', patch: { text: e.target.value } })}
          aria-label="Text above the staff"
          data-tip="Text above the staff at this beat (section names, directions)"
        />
      </div>
    ),
    connect: (
      <div className="grid grid-cols-2 gap-1">
        <ToolButton label="Hammer / pull" shortcut="H" tip="Hammer-on or pull-off to the next note on this string" pressed={!!tech.legato} disabled={noNote} onClick={() => toggle('legato')} className="col-span-2" />
        <ToolButton label="Slide to next" shortcut="S" tip="Slide to the next note on this string" pressed={tech.slide === 'legato'} disabled={noNote} onClick={() => set('slide', 'legato')} className="col-span-2" />
        <ToolButton label="Slide out up" tip="Slide up out of the note" pressed={tech.slide === 'up'} disabled={noNote} onClick={() => set('slide', 'up')} />
        <ToolButton label="Slide out down" tip="Slide down out of the note" pressed={tech.slide === 'down'} disabled={noNote} onClick={() => set('slide', 'down')} />
        <ToolButton label="Tie" shortcut="Shift+T" tip="Tie to the previous note on this string" pressed={!!tech.tie} disabled={noNote} onClick={() => toggle('tie')} className="col-span-2" />
      </div>
    ),
    bend: (
      <div className="grid grid-cols-4 gap-1">
        {[
          [1, '1/2'],
          [2, 'Full'],
          [3, '1 1/2'],
          [4, '2'],
        ].map(([v, label]) => (
          <ToolButton key={v} label={label} tip={v === 2 ? 'Bend a whole step (B)' : `Bend ${label} step${v === 1 ? '' : 's'}`} pressed={tech.bend === v} disabled={noNote} onClick={() => set('bend', v as number)} className="justify-center px-1" />
        ))}
        <ToolButton label="Release" tip="Release the bend back to pitch" pressed={!!tech.bendRelease} disabled={noNote || !tech.bend} onClick={() => set('bendRelease', true)} className="col-span-2" />
        <ToolButton label="Pre-bend" tip="Bend before picking: the note starts bent" pressed={!!tech.prebend} disabled={noNote || !tech.bend} onClick={() => toggle('prebend')} className="col-span-2" />
      </div>
    ),
    expression: (
      <div className="grid grid-cols-2 gap-1">
        <ToolButton label="Vibrato" shortcut="V" tip="Vibrato" pressed={!!tech.vibrato} disabled={noNote} onClick={() => toggle('vibrato')} />
        <ToolButton label="Palm mute" shortcut="P" tip="Palm mute (P.M.)" pressed={!!tech.palmMute} disabled={noNote} onClick={() => toggle('palmMute')} />
        <ToolButton label="Let ring" shortcut="L" tip="Let the note ring over the next ones" pressed={!!tech.letRing} disabled={noNote} onClick={() => toggle('letRing')} />
        <ToolButton label="Tap" shortcut="T" tip="Tapped note" pressed={!!tech.tapped} disabled={noNote} onClick={() => toggle('tapped')} />
        <ToolButton label="Natural harm." shortcut="N" tip="Natural harmonic" pressed={tech.harmonic === 'natural'} disabled={noNote} onClick={() => set('harmonic', 'natural')} />
        <ToolButton label="Artif. harm." tip="Artificial harmonic (A.H.)" pressed={tech.harmonic === 'artificial'} disabled={noNote} onClick={() => set('harmonic', 'artificial')} />
        <ToolButton label="Pinch harm." tip="Pinch harmonic (P.H.)" pressed={tech.harmonic === 'pinch'} disabled={noNote} onClick={() => set('harmonic', 'pinch')} />
        <ToolButton label="Tap harm." tip="Tapped harmonic (T.H.)" pressed={tech.harmonic === 'tapped'} disabled={noNote} onClick={() => set('harmonic', 'tapped')} />
        <ToolButton label="Ghost" shortcut="G" tip="Ghost note, shown in parentheses" pressed={!!tech.ghost} disabled={noNote} onClick={() => toggle('ghost')} />
      </div>
    ),
    articulation: (
      <div className="grid grid-cols-2 gap-1">
        <ToolButton label="Accent" shortcut="A" tip="Accent (>)" pressed={tech.accent === 'normal'} disabled={noNote} onClick={() => set('accent', 'normal')} />
        <ToolButton label="Heavy acc." shortcut="Shift+A" tip="Heavy accent (^)" pressed={tech.accent === 'heavy'} disabled={noNote} onClick={() => set('accent', 'heavy')} />
        <ToolButton label="Staccato" tip="Short, detached note" pressed={!!tech.staccato} disabled={noNote} onClick={() => toggle('staccato')} />
        <ToolButton label="Fade in" tip="Volume swell into the note" pressed={!!tech.fadeIn} disabled={noNote} onClick={() => toggle('fadeIn')} />
        <ToolButton label="Slap" tip="Slap (S)" pressed={!!tech.slap} disabled={noNote} onClick={() => toggle('slap')} />
        <ToolButton label="Pop" tip="Pop (P)" pressed={!!tech.pop} disabled={noNote} onClick={() => toggle('pop')} />
        <ToolButton label="Tremolo" tip="Tremolo picking: re-pick the note rapidly" pressed={!!tech.tremolo} disabled={noNote} onClick={() => toggle('tremolo')} />
        <ToolButton
          label="Trill"
          tip="Trill with the fret two above (change it in the Selection panel)"
          pressed={tech.trill !== undefined}
          disabled={noNote || tech.dead}
          onClick={() => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, 'trill', tech.trill !== undefined ? undefined : Math.min(30, (note?.fret ?? 0) + 2)) })}
        />
        <ToolButton
          label="Grace note"
          tip="Grace note two frets below, slurred in (change it in the Selection panel)"
          pressed={tech.grace !== undefined}
          disabled={noNote || tech.dead}
          onClick={() => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, 'grace', tech.grace !== undefined ? undefined : Math.max(0, (note?.fret ?? 0) - 2)) })}
          className="col-span-2"
        />
      </div>
    ),
    beat: (
      <div className="grid grid-cols-2 gap-1">
        <ToolButton label="Insert" shortcut="I" tip="Insert a beat before the cursor" onClick={() => dispatch({ type: 'insertBeat' })} />
        <ToolButton label="Delete" shortcut="Shift+Del" tip="Delete this beat" onClick={() => dispatch({ type: 'deleteBeat' })} />
        <ToolButton label="Move left" shortcut="Alt+Left" tip="Move beat left" onClick={() => dispatch({ type: 'moveBeat', dir: -1 })} />
        <ToolButton label="Move right" shortcut="Alt+Right" tip="Move beat right" onClick={() => dispatch({ type: 'moveBeat', dir: 1 })} />
        <ToolButton label="Copy" shortcut="Ctrl+C" tip="Copy beat" onClick={() => dispatch({ type: 'copyBeat' })} />
        <ToolButton label="Paste" shortcut="Ctrl+V" tip="Paste after the cursor" onClick={() => dispatch({ type: 'paste' })} />
      </div>
    ),
  };

  const meta: Partial<Record<ToolSection, React.ReactNode>> = {
    frets: `${stringName} string`,
    duration: beat.rest ? `${durationName(beat.duration)} rest` : durationName(beat.duration),
    chord: [beat.chord, beat.stroke && `strum ${beat.stroke}`, beat.dynamic].filter(Boolean).join(', ') || undefined,
    ...(noNote ? { connect: 'select a note', bend: 'select a note', expression: 'select a note', articulation: 'select a note' } : {}),
  };

  const visible = customizing ? prefs.order : prefs.order.filter((id) => !prefs.hidden.includes(id));

  return (
    <aside className="w-[236px] shrink-0 border-r border-line bg-bg100 flex flex-col" aria-label="Tools">
      <div className="h-9 shrink-0 flex items-center gap-1 pl-3 pr-1.5 border-b border-line">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Tools</span>
        {customizing && <Button size="sm" variant="ghost" icon={ArrowCounterClockwise} onClick={panel.reset} tip="Restore the default arrangement" />}
        <Button
          size="sm"
          variant={customizing ? 'primary' : 'ghost'}
          icon={customizing ? Check : SlidersHorizontal}
          onClick={() => setCustomizing((c) => !c)}
          tip={customizing ? 'Done customizing' : 'Customize: show, hide and reorder tool groups'}
        >
          {customizing ? 'Done' : undefined}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map((id, i) => (
          <PanelSection
            key={id}
            id={id}
            title={TITLES[id]}
            meta={meta[id]}
            collapsed={prefs.collapsed.includes(id)}
            onToggle={() => panel.toggleCollapsed(id)}
            customize={
              customizing
                ? {
                    hidden: prefs.hidden.includes(id),
                    onHide: () => panel.toggleHidden(id),
                    onUp: i > 0 ? () => panel.move(id, -1) : undefined,
                    onDown: i < visible.length - 1 ? () => panel.move(id, 1) : undefined,
                  }
                : undefined
            }
          >
            {body[id]}
          </PanelSection>
        ))}
        {!customizing && visible.length === 0 && (
          <p className="p-3 text-xs text-muted">All tool groups are hidden. Use the customize button above to bring them back.</p>
        )}
      </div>
    </aside>
  );
}
