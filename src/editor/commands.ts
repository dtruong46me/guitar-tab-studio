/**
 * Editing commands: named, replayable transformations of a Song. The editor runs every change to
 * the music through a Command so it lands in the undo history.
 */
import type { Duration, NoteTechniques, Position, Song, SongMeta, TimeSignature } from '../model/types';
import * as ops from '../model/operations';
import type { Beat } from '../model/types';

export interface Command {
  label: string;
  apply(song: Song): Song;
  /** Consecutive commands with the same key (within a short window) merge into one undo step. */
  mergeKey?: string;
}

const posKey = (p: Position) => `${p.track}:${p.measure}:${p.beat}:${p.string}`;

export const setFret = (pos: Position, fret: number, merge = false): Command => ({
  label: 'Enter fret',
  apply: (s) => ops.setNote(s, pos, fret),
  mergeKey: merge ? `fret:${posKey(pos)}` : undefined,
});

export const removeNote = (pos: Position): Command => ({ label: 'Delete note', apply: (s) => ops.removeNote(s, pos) });

export const setTechnique = <K extends keyof NoteTechniques>(pos: Position, key: K, value: NoteTechniques[K] | undefined): Command => ({
  label: 'Change technique',
  apply: (s) => ops.setTechnique(s, pos, key, value),
});

export const moveNoteToString = (pos: Position, target: number): Command => ({
  label: 'Move note to string',
  apply: (s) => ops.moveNoteToString(s, pos, target),
});

export const setBeatDuration = (pos: Position, d: Duration): Command => ({
  label: 'Change duration',
  apply: (s) => ops.setBeatDuration(s, pos.track, pos.measure, pos.beat, d),
});

export const clearBeat = (pos: Position): Command => ({ label: 'Make rest', apply: (s) => ops.clearBeat(s, pos.track, pos.measure, pos.beat) });

export const insertBeat = (track: number, measure: number, index: number, d?: Duration): Command => ({
  label: 'Insert beat',
  apply: (s) => ops.insertBeat(s, track, measure, index, d),
});

export const insertBeats = (track: number, measure: number, index: number, beats: Beat[]): Command => ({
  label: 'Paste',
  apply: (s) => ops.insertBeats(s, track, measure, index, beats),
});

export const deleteBeat = (pos: Position): Command => ({ label: 'Delete beat', apply: (s) => ops.deleteBeat(s, pos.track, pos.measure, pos.beat) });

export const moveBeat = (pos: Position, to: number): Command => ({
  label: 'Move beat',
  apply: (s) => ops.moveBeat(s, pos.track, pos.measure, pos.beat, to),
});

export const insertMeasure = (index: number): Command => ({ label: 'Insert measure', apply: (s) => ops.insertMeasure(s, index) });
export const deleteMeasure = (index: number): Command => ({ label: 'Delete measure', apply: (s) => ops.deleteMeasure(s, index) });
export const moveMeasure = (from: number, to: number): Command => ({ label: 'Move measure', apply: (s) => ops.moveMeasure(s, from, to) });
export const clearMeasure = (track: number, index: number): Command => ({ label: 'Clear measure', apply: (s) => ops.clearMeasure(s, track, index) });

export const setTimeSignature = (ts: TimeSignature): Command => ({ label: 'Change time signature', apply: (s) => ops.setTimeSignature(s, ts) });
export const setMeasureTimeSignature = (measure: number, ts: TimeSignature | null): Command => ({
  label: 'Time signature change',
  apply: (s) => ops.setMeasureTimeSignature(s, measure, ts),
});
export const setTempo = (bpm: number): Command => ({ label: 'Change tempo', apply: (s) => ops.setTempo(s, bpm), mergeKey: 'tempo' });
export const setMeta = (patch: Partial<SongMeta>): Command => ({
  label: 'Edit song info',
  apply: (s) => ops.setMeta(s, patch),
  mergeKey: `meta:${Object.keys(patch).join(',')}`,
});
export const setKeySignature = (key: string): Command => ({ label: 'Change key', apply: (s) => ops.setKeySignature(s, key) });
export const setTuning = (track: number, tuning: string[]): Command => ({ label: 'Change tuning', apply: (s) => ops.setTuning(s, track, tuning) });
export const setCapo = (track: number, capo: number): Command => ({ label: 'Change capo', apply: (s) => ops.setCapo(s, track, capo) });
export const addTrack = (name: string): Command => ({
  label: 'Add track',
  apply: (s) => ops.addTrack(s, name, s.tracks[s.tracks.length - 1]?.instrument),
});
export const removeTrack = (track: number): Command => ({ label: 'Delete track', apply: (s) => ops.removeTrack(s, track) });
export const renameTrack = (track: number, name: string): Command => ({ label: 'Rename track', apply: (s) => ops.renameTrack(s, track, name) });
