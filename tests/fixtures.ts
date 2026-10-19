import { buildSong } from '../src/model/demo';
import type { Song } from '../src/model/types';

/** A long song with dense sixteenth-note measures and two-digit frets. */
export function denseSong(measures: number): Song {
  const bar = Array.from({ length: 16 }, (_, i) => [16, [[i % 6, 10 + (i % 12)]]] as [16, [number, number][]]);
  return buildSong('Dense', Array.from({ length: measures }, () => bar));
}
