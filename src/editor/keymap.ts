/** Keyboard shortcuts → editor actions or app intents. Pure, so the mapping is testable. */
import type { DurationValue } from '../model/types';
import type { EditorAction } from './editor';

export type AppCommand = 'save' | 'exportPdf' | 'help' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'playPause' | 'stop' | 'metronome' | 'toggleLeft' | 'toggleRight' | 'songInfo' | 'chord';

export type Intent = { kind: 'editor'; action: EditorAction } | { kind: 'app'; command: AppCommand };

export interface KeyInput {
  key: string;
  /** Physical key (e.g. "Digit1"); used for Shift+number, whose `key` depends on the layout. */
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const ed = (action: EditorAction): Intent => ({ kind: 'editor', action });
const DURATION_BY_KEY: Record<number, DurationValue> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };
const app = (command: AppCommand): Intent => ({ kind: 'app', command });

export function keyToIntent(e: KeyInput, now = Date.now()): Intent | null {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key;
  const lower = k.length === 1 ? k.toLowerCase() : k;

  if (mod) {
    if (lower === 'z') return ed({ type: e.shiftKey ? 'redo' : 'undo' });
    if (lower === 'y') return ed({ type: 'redo' });
    if (lower === 's') return app('save');
    if (lower === 'p') return app('exportPdf');
    if (lower === 'c') return ed({ type: 'copyBeat' });
    if (lower === 'x') return ed({ type: 'cutBeat' });
    if (lower === 'v') return ed({ type: 'paste' });
    if (k === '=' || k === '+') return app('zoomIn');
    if (k === '-') return app('zoomOut');
    if (k === '0') return app('zoomReset');
    if (k === '[') return app('toggleLeft');
    if (k === ']') return app('toggleRight');
    if (lower === 'i') return app('songInfo');
    if (k === 'Enter') return ed({ type: 'insertMeasure', after: !e.shiftKey });
    if (k === 'Delete' || k === 'Backspace') return ed({ type: 'deleteMeasure' });
    if (k === 'ArrowLeft') return ed(e.altKey ? { type: 'moveMeasure', dir: -1 } : { type: 'navigate', dir: 'prevMeasure' });
    if (k === 'ArrowRight') return ed(e.altKey ? { type: 'moveMeasure', dir: 1 } : { type: 'navigate', dir: 'nextMeasure' });
    if (k === 'Home') return ed({ type: 'navigate', dir: 'songStart' });
    if (k === 'End') return ed({ type: 'navigate', dir: 'songEnd' });
    return null;
  }

  // Shift + 1..5 picks a duration (whole to sixteenth); plain digits enter frets.
  const digitCode = e.code && /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
  if (e.shiftKey && !e.altKey && digitCode) return ed({ type: 'setDuration', value: DURATION_BY_KEY[Number(digitCode[1])] });
  if (/^[0-9]$/.test(k) && !e.altKey) return ed({ type: 'digit', digit: Number(k), now });
  if (k === ' ') return app(e.shiftKey ? 'stop' : 'playPause');
  if (k === 'Escape') return app('stop');

  switch (k) {
    case 'ArrowLeft':
      return ed(e.altKey ? { type: 'moveBeat', dir: -1 } : { type: 'navigate', dir: 'left' });
    case 'ArrowRight':
      return ed(e.altKey ? { type: 'moveBeat', dir: 1 } : { type: 'navigate', dir: 'right' });
    case 'ArrowUp':
      return ed(e.altKey ? { type: 'moveNoteString', dir: -1 } : { type: 'navigate', dir: 'up' });
    case 'ArrowDown':
      return ed(e.altKey ? { type: 'moveNoteString', dir: 1 } : { type: 'navigate', dir: 'down' });
    case 'Home':
      return ed({ type: 'navigate', dir: 'measureStart' });
    case 'End':
      return ed({ type: 'navigate', dir: 'measureEnd' });
    case 'Delete':
    case 'Backspace':
      return ed({ type: e.shiftKey ? 'deleteBeat' : 'deleteNote' });
    case 'Insert':
      return ed({ type: 'insertBeat' });
    case '+':
    case '=':
      return ed({ type: 'stepDuration', dir: -1 });
    case '-':
    case '_':
      return ed({ type: 'stepDuration', dir: 1 });
    case '.':
      return ed({ type: 'toggleDot' });
    case '?':
      return app('help');
  }

  if (e.altKey) return null;
  switch (lower) {
    case 'i':
      return ed({ type: 'insertBeat' });
    case 'r':
      return ed({ type: 'makeRest' });
    case 'h':
      return ed({ type: 'toggleTechnique', key: 'legato' });
    case 'v':
      return ed({ type: 'toggleTechnique', key: 'vibrato' });
    case 'p':
      return ed({ type: 'toggleTechnique', key: 'palmMute' });
    case 'l':
      return ed(e.shiftKey ? { type: 'toggleBeatTechnique', key: 'letRing' } : { type: 'toggleTechnique', key: 'letRing' });
    case 'g':
      return ed({ type: 'toggleTechnique', key: 'ghost' });
    case 'x':
      return ed({ type: 'toggleTechnique', key: 'dead' });
    case 't':
      return ed({ type: 'toggleTechnique', key: e.shiftKey ? 'tie' : 'tapped' });
    case 's':
      return ed({ type: 'setTechnique', key: 'slide', value: 'legato' });
    case 'n':
      return ed({ type: 'setTechnique', key: 'harmonic', value: 'natural' });
    case 'b':
      return ed({ type: 'setTechnique', key: 'bend', value: 2 });
    case 'm':
      return app('metronome');
    case 'c':
      return app('chord');
    case 'a':
      return ed({ type: 'setTechnique', key: 'accent', value: e.shiftKey ? 'heavy' : 'normal' });
    case 'u':
      return ed({ type: 'toggleStroke', dir: 'up' });
    case 'd':
      return ed({ type: 'toggleStroke', dir: 'down' });
  }
  return null;
}

/** Shortcut reference shown in the shortcut guide and in tooltips. */
export const SHORTCUTS: { group: string; items: [keys: string, action: string][] }[] = [
  {
    group: 'Write notes',
    items: [
      ['0 - 9', 'Fret on the selected string'],
      ['1 then 2', 'Two quick digits: frets 10 to 30'],
      ['Delete', 'Delete note'],
      ['R', 'Rest on / off (clears the beat)'],
      ['Alt + Up / Down', 'Move note to another string (same pitch)'],
    ],
  },
  {
    group: 'Move around',
    items: [
      ['Left / Right', 'Previous / next beat'],
      ['Up / Down', 'Higher / lower string'],
      ['Ctrl + Left / Right', 'Previous / next measure'],
      ['Home / End', 'Start / end of measure'],
      ['Ctrl + Home / End', 'Start / end of song'],
    ],
  },
  {
    group: 'Rhythm',
    items: [
      ['Shift + 1', 'Whole note'],
      ['Shift + 2', 'Half note'],
      ['Shift + 3', 'Quarter note'],
      ['Shift + 4', 'Eighth note'],
      ['Shift + 5', 'Sixteenth note'],
      ['+ / -', 'Longer / shorter'],
      ['.', 'Dotted'],
    ],
  },
  {
    group: 'Techniques',
    items: [
      ['H', 'Hammer-on / pull-off'],
      ['S', 'Slide to next note'],
      ['B', 'Bend (full)'],
      ['V', 'Vibrato'],
      ['P', 'Palm mute'],
      ['L', 'Let ring (rings until the string is played again or the let ring ends)'],
      ['Shift + L', 'Let ring for every note of the beat'],
      ['N', 'Natural harmonic'],
      ['T', 'Tap'],
      ['G', 'Ghost note'],
      ['Shift + T', 'Tie to previous note'],
      ['A', 'Accent (Shift + A: heavy accent)'],
    ],
  },
  {
    group: 'Chords & strumming',
    items: [
      ['C', 'Chord name above the beat'],
      ['D', 'Strum down'],
      ['U', 'Strum up'],
      ['X', 'Dead note / string hit (works on an empty string too)'],
    ],
  },
  {
    group: 'Beats & measures',
    items: [
      ['I', 'Insert beat'],
      ['Shift + Delete', 'Delete beat'],
      ['Alt + Left / Right', 'Move beat'],
      ['Ctrl + C / X / V', 'Copy / cut / paste beat'],
      ['Ctrl + Enter', 'Insert measure after'],
      ['Ctrl + Shift + Enter', 'Insert measure before'],
      ['Ctrl + Delete', 'Delete measure'],
      ['Ctrl + Alt + Left / Right', 'Move measure'],
    ],
  },
  {
    group: 'Playback & file',
    items: [
      ['Space', 'Play / pause'],
      ['Shift + Space', 'Stop'],
      ['M', 'Metronome on / off'],
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Shift + Z', 'Redo'],
      ['Ctrl + S', 'Save now (tabs also save automatically)'],
      ['Ctrl + P', 'Print preview & PDF'],
      ['Ctrl + = / - / 0', 'Zoom in / out / reset'],
      ['Ctrl + [', 'Show / hide the tools panel'],
      ['Ctrl + ]', 'Show / hide the selection panel'],
      ['Ctrl + I', 'Song info (title, artist, composer...)'],
      ['?', 'Show this guide'],
    ],
  },
];
