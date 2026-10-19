/** Starting points offered on the home screen. Each creates a fresh song with new ids. */
import type { Song } from './types';
import { createSong, cloneSongWithNewIds } from './factory';
import { createDemoSong } from './demo';
import { createNoiNayCoAnh } from './examples/noiNayCoAnh';
import * as ops from './operations';
import { TUNING_PRESETS } from './tuning';

export interface Template {
  id: string;
  name: string;
  description: string;
  create: () => Song;
}

const tuning = (id: string) => TUNING_PRESETS.find((p) => p.id === id)!.tuning;

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank tab', description: '4/4, standard tuning', create: () => createSong('Untitled', 8) },
  {
    id: 'waltz',
    name: 'Blank 3/4',
    description: 'Waltz time, 90 BPM',
    create: () => ops.setTempo(ops.setTimeSignature(createSong('Untitled', 8), { numerator: 3, denominator: 4 }), 90),
  },
  {
    id: 'compound',
    name: 'Blank 6/8',
    description: 'Compound time, 100 BPM',
    create: () => ops.setTempo(ops.setTimeSignature(createSong('Untitled', 8), { numerator: 6, denominator: 8 }), 100),
  },
  { id: 'drop-d', name: 'Drop D', description: '4/4, low string to D', create: () => ops.setTuning(createSong('Untitled', 8), 0, tuning('drop-d')) },
  { id: 'seven', name: '7-string', description: 'Standard with low B', create: () => ops.setTuning(createSong('Untitled', 8), 0, tuning('standard-7')) },
  { id: 'noi-nay-co-anh', name: 'Nơi Này Có Anh', description: 'Example: chords, let ring, slaps', create: () => cloneSongWithNewIds(createNoiNayCoAnh()) },
  { id: 'example', name: 'Technique showcase', description: 'Example: every technique', create: () => cloneSongWithNewIds(createDemoSong()) },
];
