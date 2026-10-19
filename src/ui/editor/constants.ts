import type { TimeSignature } from '../../model/types';

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

export function parseTs(v: string): TimeSignature {
  const [n, d] = v.split('/').map(Number);
  return { numerator: n, denominator: d as TimeSignature['denominator'] };
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;
