/** Keyboard shortcuts → editor actions or app intents. Pure, so the mapping is testable. */
import type { EditorAction } from './editor';

export type AppCommand = 'save' | 'exportPdf' | 'help' | 'zoomIn' | 'zoomOut' | 'zoomReset';

export type Intent = { kind: 'editor'; action: EditorAction } | { kind: 'app'; command: AppCommand };

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const ed = (action: EditorAction): Intent => ({ kind: 'editor', action });
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
    if (k === 'Enter') return ed({ type: 'insertMeasure', after: !e.shiftKey });
    if (k === 'Delete' || k === 'Backspace') return ed({ type: 'deleteMeasure' });
    if (k === 'ArrowLeft') return ed(e.altKey ? { type: 'moveMeasure', dir: -1 } : { type: 'navigate', dir: 'prevMeasure' });
    if (k === 'ArrowRight') return ed(e.altKey ? { type: 'moveMeasure', dir: 1 } : { type: 'navigate', dir: 'nextMeasure' });
    if (k === 'Home') return ed({ type: 'navigate', dir: 'songStart' });
    if (k === 'End') return ed({ type: 'navigate', dir: 'songEnd' });
    return null;
  }

  if (/^[0-9]$/.test(k) && !e.altKey) return ed({ type: 'digit', digit: Number(k), now });

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
      return ed({ type: 'toggleTechnique', key: 'letRing' });
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
  }
  return null;
}

/** Shortcut reference shown in the help dialog. */
export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Notes',
    items: [
      ['0–9', 'Enter fret on the selected string (type two digits quickly for 10–30)'],
      ['Delete / Backspace', 'Delete note'],
      ['Alt + ↑ / ↓', 'Move note to the next string, keeping its pitch'],
      ['R', 'Make the beat a rest (clear its notes)'],
    ],
  },
  {
    group: 'Navigation',
    items: [
      ['← / →', 'Previous / next beat (→ at the end adds a beat or measure)'],
      ['↑ / ↓', 'Higher / lower string'],
      ['Ctrl + ← / →', 'Previous / next measure'],
      ['Home / End', 'Start / end of measure'],
      ['Ctrl + Home / End', 'Start / end of song'],
    ],
  },
  {
    group: 'Beats & measures',
    items: [
      ['+ / −', 'Longer / shorter duration'],
      ['.', 'Toggle dotted'],
      ['I / Insert', 'Insert beat before the cursor'],
      ['Shift + Delete', 'Delete beat'],
      ['Alt + ← / →', 'Move beat left / right'],
      ['Ctrl + C / X / V', 'Copy / cut / paste beat'],
      ['Ctrl + Enter', 'Insert measure after (Shift: before)'],
      ['Ctrl + Delete', 'Delete measure'],
      ['Ctrl + Alt + ← / →', 'Move measure left / right'],
    ],
  },
  {
    group: 'Techniques (on the selected note)',
    items: [
      ['H', 'Hammer-on / pull-off'],
      ['S', 'Slide to next note'],
      ['B', 'Full bend'],
      ['V', 'Vibrato'],
      ['P', 'Palm mute'],
      ['L', 'Let ring'],
      ['N', 'Natural harmonic'],
      ['T', 'Tap'],
      ['G', 'Ghost note'],
      ['X', 'Dead note'],
      ['Shift + T', 'Tie to previous note'],
    ],
  },
  {
    group: 'Project',
    items: [
      ['Ctrl + Z', 'Undo'],
      ['Ctrl + Shift + Z / Ctrl + Y', 'Redo'],
      ['Ctrl + S', 'Save'],
      ['Ctrl + P', 'Print preview & export PDF'],
      ['Ctrl + = / − / 0', 'Zoom in / out / reset'],
      ['?', 'Show shortcuts'],
    ],
  },
];
