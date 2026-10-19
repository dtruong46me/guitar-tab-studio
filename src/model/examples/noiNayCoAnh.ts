/**
 * Example: "Nơi Này Có Anh" (Sơn Tùng M-TP), fingerstyle arrangement by Mitxi Tòng, tab by Sang Pham.
 * A short excerpt for practice and demonstration: the intro (bars 1-8) and four bars of the
 * percussive groove (bars 33-36), where "x" on the bass strings is the slap on the strings.
 * Notes and rhythms follow the published tab; chord names are added for readability.
 */
import type { NoteTechniques, Song } from '../types';
import { buildSong, type BeatSpec, type NoteSpec } from '../demo';
import * as ops from '../operations';

// Strings: 0 = high E ... 5 = low E.
const X: NoteTechniques = { dead: true };
const slap: NoteSpec[] = [
  [4, 0, X],
  [5, 0, X],
];

const intro: BeatSpec[][] = [
  // 1
  [[4, [[0, 0]], false, { chord: 'F', text: 'Intro', dynamic: 'f' }], [8, [[0, 1]]], [8, [[0, 3]]], [4, [[2, 2], [5, 1]]], [8, [[3, 3]]], [8, []]],
  // 2
  [[4, [[0, 0]], false, { chord: 'G' }], [8, [[0, 1]]], [8, [[0, 3]]], [4, [[1, 0], [5, 3]]], [8, [[2, 0]]], [8, []]],
  // 3
  [[4, [[0, 0]], false, { chord: 'Am' }], [8, [[0, 1]]], [8, [[0, 3]]], [4, [[1, 1], [2, 0], [4, 0]]], [4, [[0, 3]]]],
  // 4
  [[4, [[0, 0]], false, { chord: 'Em' }], [8, [[0, 5]]], [8, [[0, 3]]], [8, [[5, 0]]], [8, [[2, 0]]], [4, [[0, 3]]]],
  // 5
  [[8, [[0, 0]], false, { chord: 'F' }], [8, [[1, 3]]], [4, [[1, 1]]], [4, [[1, 3], [2, 2], [5, 1]], true], [8, [[3, 3]]]],
  // 6
  [[8, [[0, 0]], false, { chord: 'G' }], [8, [[1, 3]]], [4, [[1, 1]]], [4, [[1, 3], [2, 0], [5, 3]]], [8, [[1, 1]]], [8, [[1, 3]]]],
  // 7
  [[8, [[0, 0, { tie: true }]], false, { chord: 'C' }], [4, [[0, 3]]], [8, [[0, 0]]], [4, [[4, 3]]], [8, [[2, 0]]], [8, [[1, 1]]]],
  // 8
  [[8, [[1, 1, { tie: true }]]], [4, [[1, 3]]], [8, [[0, 0]]], [4, [[4, 3]]], [8, [[2, 0]]], [8, [[1, 1]]]],
];

const groove: BeatSpec[][] = [
  // 33
  [
    [8, [[2, 0, { legato: true }], [5, 0]], false, { chord: 'Em', text: 'Groove', dynamic: 'mf' }],
    [4, [[2, 2]]],
    [8, [[2, 0]]],
    [8, [[2, 0, { legato: true }], [5, 1]], false, { chord: 'F' }],
    [8, [[2, 2]]],
    [4, [[1, 1], [3, 3]]],
  ],
  // 34
  [
    [8, [[1, 1, { legato: true }], [2, 2], ...slap], false, { chord: 'Am', dynamic: 'f' }],
    [8, [[1, 3]]],
    [8, [[0, 0]]],
    [8, [[2, 0, { ghost: true }]]],
    [4, [[0, 0], [5, 3]], false, { chord: 'G' }],
    [4, [[1, 3], [5, 3]]],
  ],
  // 35
  [
    [4, [[1, 3], [2, 0], ...slap], false, { chord: 'G' }],
    [4, [[1, 0]]],
    [4, [[1, 0], [4, 0]], false, { chord: 'Am' }],
    [4, [[1, 1], [2, 2]], false, { stroke: 'up' }],
  ],
  // 36
  [[4, [[1, 1], [2, 2], ...slap], false, { chord: 'Am' }], [8, [[2, 2]]], [8, [[0, 0], [1, 1], [2, 2]]], [8, [[4, 0]]], [8, [[0, 0], [1, 1], [2, 2]]], [4, [[4, 0]]]],
];

export function createNoiNayCoAnh(): Song {
  let song = buildSong('Nơi Này Có Anh', [...intro, ...groove]);
  // The whole arrangement is played let ring (slaps excepted).
  song.tracks[0].measures.forEach((m, mi) =>
    m.beats.forEach((b, bi) =>
      b.notes.forEach((n) => {
        if (!n.techniques.dead) song = ops.setTechnique(song, { track: 0, measure: mi, beat: bi, string: n.string }, 'letRing', true);
      }),
    ),
  );
  song = ops.setTempo(song, 172);
  song = ops.renameTrack(song, 0, 'Guitar');
  return ops.setMeta(song, {
    subtitle: 'Guitar solo, intro and groove (excerpt)',
    artist: 'Sơn Tùng M-TP',
    composer: 'Sơn Tùng M-TP',
    arranger: 'Mitxi Tòng',
    tabbedBy: 'Sang Pham',
    copyright: 'Excerpt for practice: bars 1-8 and 33-36 of the arrangement.',
  });
}
