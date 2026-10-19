/** A short example song built through the public operations (used for first run and tests). */
import type { Duration, NoteTechniques, Song } from './types';
import { createSong } from './factory';
import * as ops from './operations';

export type NoteSpec = [string: number, fret: number, techniques?: NoteTechniques];
export type BeatSpec = [value: Duration['value'], notes: NoteSpec[], dotted?: boolean, props?: ops.BeatProps];

export function buildSong(title: string, measures: BeatSpec[][]): Song {
  let song = createSong(title, measures.length);
  measures.forEach((beats, mi) => {
    beats.forEach(([value, notes, dotted, props], bi) => {
      if (bi > 0) song = ops.insertBeat(song, 0, mi, bi);
      song = ops.setBeatDuration(song, 0, mi, bi, { value, dotted: !!dotted });
      if (props) song = ops.setBeatProps(song, 0, mi, bi, props);
      if (notes.length === 0) song = ops.setRest(song, 0, mi, bi, true);
      for (const [string, fret, techniques] of notes) {
        const pos = { track: 0, measure: mi, beat: bi, string };
        song = ops.setNote(song, pos, fret);
        for (const [k, v] of Object.entries(techniques ?? {})) song = ops.setTechnique(song, pos, k as keyof NoteTechniques, v as never);
      }
    });
  });
  return song;
}

export function createDemoSong(): Song {
  const pm = { palmMute: true };
  let song = buildSong('Technique Showcase', [
    [[8, [[5, 0, pm]]], [8, [[5, 0, pm]]], [8, [[4, 2, pm]]], [8, [[5, 0, pm]]], [8, [[3, 2]]], [8, [[3, 4]]], [8, [[2, 4]]], [8, [[3, 2]]]],
    [[4, [[1, 5, { legato: true }]]], [4, [[1, 7]]], [8, [[0, 5, { slide: 'legato' }]]], [8, [[0, 7]]], [4, [[0, 7, { bend: 2, bendRelease: true }]]]],
    [[4, [[4, 0, { letRing: true }], [3, 2, { letRing: true }], [2, 2, { letRing: true }], [1, 1, { letRing: true }], [0, 0, { letRing: true }]]], [4, [[2, 2, { letRing: true }]]], [4, []], [16, [[1, 12, { harmonic: 'natural' }]]], [16, [[2, 12, { harmonic: 'natural' }]]], [16, [[1, 3, { ghost: true }]]], [16, [[0, 3, { vibrato: true }]]]],
    [[2, [[5, 0], [4, 2], [3, 2]]], [4, [[5, 3, { dead: true }]]], [4, [[0, 12, { tapped: true, legato: true }]]]],
    [
      [4, [[4, 3], [3, 2], [2, 0], [1, 1], [0, 0]], false, { chord: 'C', stroke: 'down', dynamic: 'mf', text: 'More techniques' }],
      [4, [[2, 7, { grace: 5 }]]],
      [4, [[1, 8, { trill: 10 }]], false, { dynamic: 'f' }],
      [8, [[0, 5, { accent: 'normal' }]]],
      [8, [[0, 7, { staccato: true }]]],
    ],
    [
      [4, [[1, 8, { bend: 2, prebend: true, bendRelease: true }]], false, { chord: 'Am' }],
      [4, [[2, 5, { harmonic: 'pinch', vibrato: true }]]],
      [4, [[4, 0, { dead: true }], [5, 0, { dead: true }]], false, { stroke: 'down' }],
      [4, [[4, 0], [3, 2], [2, 2], [1, 1], [0, 0]], false, { chord: 'Am', stroke: 'up' }],
    ],
  ]);
  song = ops.setMeta(song, { artist: 'Guitar Tab Studio', composer: 'Example', tabbedBy: 'Example' });
  return song;
}
