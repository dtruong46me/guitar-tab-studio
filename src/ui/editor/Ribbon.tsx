/**
 * Ribbon: commands grouped by task under tabs (Notes, Techniques, Measure, Song, View), in the
 * manner of Word or Acrobat. Every button names its shortcut in its tooltip.
 */
import { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowLineLeft,
  ArrowLineRight,
  ArrowRight,
  ArrowUp,
  CaretDown,
  CaretUp,
  ClipboardText,
  Copy,
  Eraser,
  Keyboard,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  PencilSimple,
  Plus,
  Scissors,
  Trash,
} from '@phosphor-icons/react';
import type { DurationValue, HarmonicType, NoteTechniques, Position, SlideType, Song, TimeSignature } from '../../model/types';
import { effectiveTimeSignatures, TICKS_PER_QUARTER } from '../../model/duration';
import { findNote, MAX_TEMPO, MIN_TEMPO } from '../../model/operations';
import { findPreset, MAX_CAPO, MAX_FRET, midiToPitch, pitchClass, pitchToMidi, TUNING_PRESETS } from '../../model/tuning';
import * as cmd from '../../editor/commands';
import { measureFill, type BooleanTechnique, type EditorAction } from '../../editor/editor';
import { Button, Divider, Segmented } from '../controls';
import { NumberField } from '../NumberField';
import type { Theme } from '../theme';

export type RibbonTab = 'notes' | 'techniques' | 'measure' | 'song' | 'view';

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'techniques', label: 'Techniques' },
  { id: 'measure', label: 'Measure' },
  { id: 'song', label: 'Song' },
  { id: 'view', label: 'View' },
];

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
const parseTs = (v: string): TimeSignature => {
  const [n, d] = v.split('/').map(Number);
  return { numerator: n, denominator: d as TimeSignature['denominator'] };
};

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
  zoom: number;
  onZoom: (z: number) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onShortcuts: () => void;
  onEditTuning: () => void;
}

export function Ribbon(props: Props) {
  const [tab, setTab] = useState<RibbonTab>('notes');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="shrink-0 border-b border-line bg-bg100">
      <div className="flex items-end h-8 px-2 gap-0.5" role="tablist" aria-label="Ribbon">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (tab === t.id && !collapsed ? setCollapsed(true) : (setTab(t.id), setCollapsed(false)))}
            className={`relative h-8 px-3 text-[13px] transition-colors ${tab === t.id ? 'text-ink font-medium' : 'text-muted hover:text-ink'}`}
          >
            {t.label}
            {tab === t.id && !collapsed && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={collapsed ? CaretDown : CaretUp} keepFocus tip={collapsed ? 'Show ribbon' : 'Hide ribbon'} onClick={() => setCollapsed((c) => !c)} className="mb-1" />
      </div>
      {!collapsed && (
        <div role="tabpanel" className="h-[76px] flex items-stretch gap-1 px-2 pb-1.5 overflow-x-auto overflow-y-hidden border-t border-line">
          {tab === 'notes' && <NotesTab {...props} />}
          {tab === 'techniques' && <TechniquesTab {...props} />}
          {tab === 'measure' && <MeasureTab {...props} />}
          {tab === 'song' && <SongTab {...props} />}
          {tab === 'view' && <ViewTab {...props} />}
        </div>
      )}
    </div>
  );
}

function Group({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <>
      <div className="flex flex-col shrink-0 pt-2" role="group" aria-label={label}>
        <div className="flex-1 flex items-start gap-1 px-1.5">{children}</div>
        <div className="text-[11px] text-muted text-center leading-4">{label}</div>
      </div>
      {!last && <Divider />}
    </>
  );
}

const DURATIONS: { value: DurationValue; label: string; name: string; key: string }[] = [
  { value: 1, label: '1', name: 'Whole note', key: 'Shift+1' },
  { value: 2, label: '2', name: 'Half note', key: 'Shift+2' },
  { value: 4, label: '4', name: 'Quarter note', key: 'Shift+3' },
  { value: 8, label: '8', name: 'Eighth note', key: 'Shift+4' },
  { value: 16, label: '16', name: 'Sixteenth note', key: 'Shift+5' },
];

function NotesTab({ song, cursor, dispatch }: Props) {
  const track = song.tracks[cursor.track];
  const beat = track.measures[cursor.measure].beats[cursor.beat];
  const note = findNote(song, cursor);
  const stringName = pitchClass(track.instrument.tuning[cursor.string]);
  return (
    <>
      <Group label="Clipboard">
        <Button icon={ClipboardText} keepFocus onClick={() => dispatch({ type: 'paste' })} tip="Paste beats after the cursor" shortcut="Ctrl+V">
          Paste
        </Button>
        <Button icon={Scissors} keepFocus onClick={() => dispatch({ type: 'cutBeat' })} tip="Cut beat" shortcut="Ctrl+X" />
        <Button icon={Copy} keepFocus onClick={() => dispatch({ type: 'copyBeat' })} tip="Copy beat" shortcut="Ctrl+C" />
      </Group>
      <Group label={`Note on ${stringName} string`}>
        <label className="flex items-center gap-1.5" data-tip={`Fret 0 to ${MAX_FRET}. Or just type the number on the sheet.`}>
          <span className="label">Fret</span>
          <NumberField className="field w-14 font-mono" value={note ? note.fret : null} min={0} max={MAX_FRET} placeholder="-" onCommit={(v) => dispatch({ type: 'setFret', fret: v })} ariaLabel="Fret number" />
        </label>
        <Button icon={ArrowUp} keepFocus disabled={!note} onClick={() => dispatch({ type: 'moveNoteString', dir: -1 })} tip="Move note to the higher string, same pitch" shortcut="Alt+Up" />
        <Button icon={ArrowDown} keepFocus disabled={!note} onClick={() => dispatch({ type: 'moveNoteString', dir: 1 })} tip="Move note to the lower string, same pitch" shortcut="Alt+Down" />
        <Button icon={Trash} keepFocus disabled={!note} onClick={() => dispatch({ type: 'deleteNote' })} tip="Delete note" shortcut="Delete" />
      </Group>
      <Group label="Duration">
        <Segmented
          label="Duration"
          mono
          value={beat.duration.value}
          onChange={(value) => dispatch({ type: 'setDuration', value })}
          options={DURATIONS.map((d) => ({ value: d.value, label: d.label, tip: d.name, shortcut: d.key }))}
        />
        <Button keepFocus pressed={beat.duration.dotted} onClick={() => dispatch({ type: 'toggleDot' })} tip="Dotted: 1.5 times as long" shortcut=".">
          Dot
        </Button>
        <Button keepFocus disabled={beat.notes.length === 0} onClick={() => dispatch({ type: 'makeRest' })} tip="Clear the beat so it becomes a rest" shortcut="R">
          Rest
        </Button>
      </Group>
      <Group label="Beat" last>
        <Button icon={Plus} keepFocus onClick={() => dispatch({ type: 'insertBeat' })} tip="Insert a beat before the cursor" shortcut="I">
          Insert
        </Button>
        <Button icon={Trash} keepFocus onClick={() => dispatch({ type: 'deleteBeat' })} tip="Delete beat" shortcut="Shift+Delete" />
        <Button icon={ArrowLeft} keepFocus onClick={() => dispatch({ type: 'moveBeat', dir: -1 })} tip="Move beat left" shortcut="Alt+Left" />
        <Button icon={ArrowRight} keepFocus onClick={() => dispatch({ type: 'moveBeat', dir: 1 })} tip="Move beat right" shortcut="Alt+Right" />
      </Group>
    </>
  );
}

const TOGGLES: Record<string, { key: BooleanTechnique; label: string; tip: string; shortcut: string }[]> = {
  Sustain: [
    { key: 'vibrato', label: 'Vibrato', tip: 'Vibrato', shortcut: 'V' },
    { key: 'letRing', label: 'Let ring', tip: 'Let the note ring over the next ones', shortcut: 'L' },
    { key: 'palmMute', label: 'Palm mute', tip: 'Palm mute (P.M.)', shortcut: 'P' },
  ],
  Articulation: [
    { key: 'tapped', label: 'Tap', tip: 'Tapped note', shortcut: 'T' },
    { key: 'ghost', label: 'Ghost', tip: 'Ghost note, shown in parentheses', shortcut: 'G' },
    { key: 'dead', label: 'Dead', tip: 'Dead (muted) note, shown as x', shortcut: 'X' },
    { key: 'tie', label: 'Tie', tip: 'Tie to the previous note on this string', shortcut: 'Shift+T' },
  ],
};

function TechniquesTab({ song, cursor, dispatch }: Props) {
  const note = findNote(song, cursor);
  const tech: NoteTechniques = note?.techniques ?? {};
  const set = <K extends keyof NoteTechniques>(key: K, value: NoteTechniques[K] | undefined) => dispatch({ type: 'exec', command: cmd.setTechnique(cursor, key, value) });
  const toggle = (t: { key: BooleanTechnique; label: string; tip: string; shortcut: string }) => (
    <Button key={t.key} keepFocus disabled={!note} pressed={!!tech[t.key]} onClick={() => dispatch({ type: 'toggleTechnique', key: t.key })} tip={t.tip} shortcut={t.shortcut}>
      {t.label}
    </Button>
  );
  return (
    <>
      {!note && (
        <div className="flex items-center px-3 text-xs text-muted max-w-[180px] shrink-0">Select a note on the sheet to apply techniques.</div>
      )}
      <Group label="Connect">
        <Button keepFocus disabled={!note} pressed={!!tech.legato} onClick={() => dispatch({ type: 'toggleTechnique', key: 'legato' })} tip="Hammer-on or pull-off to the next note on this string" shortcut="H">
          Hammer / pull
        </Button>
        <select className="field" disabled={!note} value={tech.slide ?? ''} onChange={(e) => set('slide', (e.target.value || undefined) as SlideType | undefined)} aria-label="Slide" data-tip="Slide" data-kbd="S">
          <option value="">No slide</option>
          <option value="legato">Slide to next</option>
          <option value="up">Slide out up</option>
          <option value="down">Slide out down</option>
        </select>
      </Group>
      <Group label="Bend">
        <select className="field" disabled={!note} value={tech.bend ?? 0} onChange={(e) => set('bend', Number(e.target.value) || undefined)} aria-label="Bend amount" data-tip="Bend amount" data-kbd="B">
          <option value={0}>No bend</option>
          <option value={1}>Bend 1/2</option>
          <option value={2}>Bend full</option>
          <option value={3}>Bend 1 1/2</option>
          <option value={4}>Bend 2</option>
        </select>
        <Button keepFocus disabled={!note || !tech.bend} pressed={!!tech.bendRelease} onClick={() => set('bendRelease', tech.bendRelease ? undefined : true)} tip="Release the bend back to pitch">
          Release
        </Button>
      </Group>
      <Group label="Sustain">{TOGGLES.Sustain.map(toggle)}</Group>
      <Group label="Articulation" last>
        <select className="field" disabled={!note} value={tech.harmonic ?? ''} onChange={(e) => set('harmonic', (e.target.value || undefined) as HarmonicType | undefined)} aria-label="Harmonic" data-tip="Harmonic" data-kbd="N">
          <option value="">No harmonic</option>
          <option value="natural">Natural harm.</option>
          <option value="artificial">Artificial harm.</option>
        </select>
        {TOGGLES.Articulation.map(toggle)}
      </Group>
    </>
  );
}

function MeasureTab({ song, cursor, dispatch }: Props) {
  const ts = effectiveTimeSignatures(song)[cursor.measure];
  const change = song.masterBars[cursor.measure].timeSignature;
  const fill = measureFill(song, cursor.track, cursor.measure);
  const beatTicks = (TICKS_PER_QUARTER * 4) / ts.denominator;
  const diff = (fill.capacity - fill.used) / beatTicks;
  const fmt = (n: number) => `${+Math.abs(n).toFixed(2)} beat${Math.abs(n) === 1 ? '' : 's'}`;
  const status = diff === 0 ? 'Measure is full' : diff > 0 ? `${fmt(diff)} left` : `${fmt(diff)} too long`;
  return (
    <>
      <Group label={`Measure ${cursor.measure + 1} of ${song.masterBars.length}`}>
        <Button icon={ArrowLineLeft} keepFocus onClick={() => dispatch({ type: 'insertMeasure', after: false })} tip="Insert measure before" shortcut="Ctrl+Shift+Enter">
          Insert before
        </Button>
        <Button icon={ArrowLineRight} keepFocus onClick={() => dispatch({ type: 'insertMeasure', after: true })} tip="Insert measure after" shortcut="Ctrl+Enter">
          Insert after
        </Button>
      </Group>
      <Group label="Arrange">
        <Button icon={ArrowLeft} keepFocus disabled={cursor.measure === 0} onClick={() => dispatch({ type: 'moveMeasure', dir: -1 })} tip="Move measure left" shortcut="Ctrl+Alt+Left" />
        <Button icon={ArrowRight} keepFocus disabled={cursor.measure >= song.masterBars.length - 1} onClick={() => dispatch({ type: 'moveMeasure', dir: 1 })} tip="Move measure right" shortcut="Ctrl+Alt+Right" />
        <Button icon={Eraser} keepFocus onClick={() => dispatch({ type: 'exec', command: cmd.clearMeasure(cursor.track, cursor.measure), cursor: { ...cursor, beat: 0 } })} tip="Remove all notes in this measure (this track)">
          Clear
        </Button>
        <Button variant="danger" icon={Trash} keepFocus onClick={() => dispatch({ type: 'deleteMeasure' })} tip="Delete this measure in every track" shortcut="Ctrl+Delete">
          Delete
        </Button>
      </Group>
      <Group label="Time signature" last>
        <select
          className="field font-mono"
          value={change ? tsKey(change) : ''}
          onChange={(e) => dispatch({ type: 'exec', command: cmd.setMeasureTimeSignature(cursor.measure, e.target.value ? parseTs(e.target.value) : null) })}
          aria-label="Time signature change at this measure"
          data-tip="Change the time signature from this measure on"
        >
          <option value="">{`Same (${tsKey(ts)})`}</option>
          {TIME_SIGNATURES.map((t) => (
            <option key={tsKey(t)} value={tsKey(t)}>
              {`Change to ${tsKey(t)}`}
            </option>
          ))}
        </select>
        <span className={`self-center text-xs whitespace-nowrap ${diff < 0 ? 'text-danger' : 'text-muted'}`}>{status}</span>
      </Group>
    </>
  );
}

function SongTab({ song, cursor, dispatch, onEditTuning }: Props) {
  const exec = (c: cmd.Command) => dispatch({ type: 'exec', command: c });
  const track = song.tracks[cursor.track];
  const { tuning, capo } = track.instrument;
  const preset = findPreset(tuning);
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
  const meta = (key: 'artist' | 'album' | 'tabbedBy', label: string) => (
    <label className="flex items-center gap-1.5">
      <span className="label w-16 text-right whitespace-nowrap">{label}</span>
      <input className="field h-6 w-32" value={song.meta[key]} maxLength={120} onChange={(e) => exec(cmd.setMeta({ [key]: e.target.value }))} />
    </label>
  );
  return (
    <>
      <Group label="Song info">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 -mt-0.5">
          {meta('artist', 'Artist')}
          {meta('album', 'Album')}
          {meta('tabbedBy', 'Tabbed by')}
        </div>
      </Group>
      <Group label="Tempo and time">
        <label className="flex items-center gap-1.5" data-tip={`Written tempo, ${MIN_TEMPO} to ${MAX_TEMPO} BPM`}>
          <NumberField className="field w-14 font-mono" value={song.tempo} min={MIN_TEMPO} max={MAX_TEMPO} onCommit={(v) => exec(cmd.setTempo(v))} ariaLabel="Tempo in BPM" />
          <span className="text-xs text-muted">BPM</span>
        </label>
        <select className="field font-mono" value={tsKey(song.timeSignature)} onChange={(e) => exec(cmd.setTimeSignature(parseTs(e.target.value)))} aria-label="Time signature" data-tip="Time signature of the song">
          {!TIME_SIGNATURES.some((t) => tsKey(t) === tsKey(song.timeSignature)) && <option value={tsKey(song.timeSignature)}>{tsKey(song.timeSignature)}</option>}
          {TIME_SIGNATURES.map((t) => (
            <option key={tsKey(t)} value={tsKey(t)}>
              {tsKey(t)}
            </option>
          ))}
        </select>
      </Group>
      <Group label={`Instrument (${track.name})`} last>
        <select
          className="field w-40"
          value={preset?.id ?? 'custom'}
          onChange={(e) => {
            const p = TUNING_PRESETS.find((x) => x.id === e.target.value);
            if (!p) return;
            if (p.tuning.length < tuning.length && !window.confirm('Notes on the removed string will be deleted. Continue?')) return;
            exec(cmd.setTuning(cursor.track, p.tuning));
          }}
          aria-label="Tuning"
          data-tip={`Tuning: ${[...tuning].reverse().map(pitchClass).join(' ')}`}
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
        <Button icon={PencilSimple} onClick={onEditTuning} tip="Tune each string">
          Edit tuning
        </Button>
        <Segmented
          label="Strings"
          value={tuning.length}
          onChange={setStrings}
          options={[
            { value: 6, label: '6 str', tip: '6-string guitar' },
            { value: 7, label: '7 str', tip: '7-string guitar' },
          ]}
        />
        <select className="field" value={capo} onChange={(e) => exec(cmd.setCapo(cursor.track, Number(e.target.value)))} aria-label="Capo" data-tip="Capo position">
          {Array.from({ length: MAX_CAPO + 1 }, (_, i) => (
            <option key={i} value={i}>
              {i === 0 ? 'No capo' : `Capo ${i}`}
            </option>
          ))}
        </select>
      </Group>
    </>
  );
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;

function ViewTab({ zoom, onZoom, theme, onTheme, onShortcuts }: Props) {
  return (
    <>
      <Group label="Zoom">
        <Button icon={MagnifyingGlassMinus} keepFocus disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clampZoom(zoom - 0.1))} tip="Zoom out" shortcut="Ctrl+-" />
        <Button keepFocus onClick={() => onZoom(1)} tip="Reset zoom" shortcut="Ctrl+0" className="font-mono w-14">
          {Math.round(zoom * 100)}%
        </Button>
        <Button icon={MagnifyingGlassPlus} keepFocus disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clampZoom(zoom + 0.1))} tip="Zoom in" shortcut="Ctrl+=" />
      </Group>
      <Group label="Theme">
        <Segmented
          label="Theme"
          value={theme}
          onChange={onTheme}
          options={[
            { value: 'studio', label: 'Dark' },
            { value: 'paper', label: 'Light' },
          ]}
        />
      </Group>
      <Group label="Help" last>
        <Button icon={Keyboard} onClick={onShortcuts} tip="All keyboard shortcuts" shortcut="?">
          Shortcuts
        </Button>
      </Group>
    </>
  );
}
