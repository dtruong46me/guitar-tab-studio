import type { Duration, DurationValue, Song, TimeSignature } from './types';
import { DURATION_VALUES } from './types';

/** Ticks per quarter note. A whole note is 4 × this. */
export const TICKS_PER_QUARTER = 960;
const WHOLE = TICKS_PER_QUARTER * 4;

export function durationTicks(d: Duration): number {
  const base = WHOLE / d.value;
  return d.dotted ? base * 1.5 : base;
}

export function measureCapacity(ts: TimeSignature): number {
  return (WHOLE / ts.denominator) * ts.numerator;
}

export function durationName(d: Duration): string {
  const names: Record<DurationValue, string> = { 1: 'Whole', 2: 'Half', 4: 'Quarter', 8: 'Eighth', 16: 'Sixteenth' };
  return d.dotted ? `Dotted ${names[d.value].toLowerCase()}` : names[d.value];
}

/** Next longer (-1) or shorter (+1) duration value, clamped to the supported range. */
export function stepDuration(value: DurationValue, direction: 1 | -1): DurationValue {
  const i = DURATION_VALUES.indexOf(value);
  const next = Math.min(DURATION_VALUES.length - 1, Math.max(0, i + direction));
  return DURATION_VALUES[next];
}

/** Effective time signature for each measure, resolving inherited changes. */
export function effectiveTimeSignatures(song: Song): TimeSignature[] {
  let current = song.timeSignature;
  return song.masterBars.map((mb) => {
    if (mb.timeSignature) current = mb.timeSignature;
    return current;
  });
}

/** Effective tempo for each measure, resolving inherited changes. */
export function effectiveTempos(song: Song): number[] {
  let current = song.tempo;
  return song.masterBars.map((mb) => {
    if (mb.tempo) current = mb.tempo;
    return current;
  });
}

export function sameTimeSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}
