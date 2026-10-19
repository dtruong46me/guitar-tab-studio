const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLATS: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

export const MAX_FRET = 30;
export const MAX_CAPO = 12;

export interface TuningPreset {
  id: string;
  name: string;
  /** Highest string first. */
  tuning: string[];
}

export const TUNING_PRESETS: TuningPreset[] = [
  { id: 'standard', name: 'Standard', tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'] },
  { id: 'half-down', name: 'Half step down', tuning: ['D#4', 'A#3', 'F#3', 'C#3', 'G#2', 'D#2'] },
  { id: 'drop-d', name: 'Drop D', tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'D2'] },
  { id: 'dadgad', name: 'DADGAD', tuning: ['D4', 'A3', 'G3', 'D3', 'A2', 'D2'] },
  { id: 'open-g', name: 'Open G', tuning: ['D4', 'B3', 'G3', 'D3', 'G2', 'D2'] },
  { id: 'open-d', name: 'Open D', tuning: ['D4', 'A3', 'F#3', 'D3', 'A2', 'D2'] },
  { id: 'standard-7', name: '7-string standard', tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'B1'] },
  { id: 'drop-a-7', name: '7-string drop A', tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'A1'] },
];

export const STANDARD_TUNING = TUNING_PRESETS[0].tuning;

/** Parse "E2", "F#3", "Bb1" into a MIDI note number, or null when invalid. */
export function pitchToMidi(pitch: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(pitch.trim());
  if (!m) return null;
  let name = m[1].toUpperCase() + m[2];
  if (FLATS[name]) name = FLATS[name];
  if (name === 'Cb') return (Number(m[3]) + 1) * 12 - 1;
  if (name === 'Fb') name = 'E';
  if (name === 'E#') name = 'F';
  if (name === 'B#') return (Number(m[3]) + 2) * 12;
  const idx = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  if (idx < 0) return null;
  return (Number(m[3]) + 1) * 12 + idx;
}

export function midiToPitch(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Note letter without octave, e.g. "F#3" → "F#". */
export function pitchClass(pitch: string): string {
  return pitch.replace(/-?\d+$/, '');
}

export function isValidPitch(pitch: string): boolean {
  const midi = pitchToMidi(pitch);
  return midi !== null && midi >= 12 && midi <= 108;
}

export function findPreset(tuning: string[]): TuningPreset | undefined {
  return TUNING_PRESETS.find((p) => p.tuning.length === tuning.length && p.tuning.every((t, i) => t === tuning[i]));
}

/** Sounding MIDI pitch of a fretted note, including capo. */
export function notePitch(tuning: string[], capo: number, string: number, fret: number): number {
  const open = pitchToMidi(tuning[string]) ?? 40;
  return open + capo + fret;
}

/** Selectable pitches for custom tuning menus (B0..E5). */
export function pitchOptions(): string[] {
  const out: string[] = [];
  for (let midi = 23; midi <= 76; midi++) out.push(midiToPitch(midi));
  return out.reverse();
}
