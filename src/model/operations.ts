/**
 * Pure operations on a Song. Each takes a song and returns a new song (structural sharing via immer);
 * inputs are never mutated. Invalid addresses are no-ops that return the original song.
 */
import { produce } from 'immer';
import type { Beat, Duration, Instrument, Note, NoteTechniques, Position, Song, SongMeta, TimeSignature } from './types';
import { cloneBeat, createBeat, createMeasure, createTrack } from './factory';
import { MAX_CAPO, MAX_FRET, notePitch, pitchToMidi } from './tuning';

function getBeat(song: Song, track: number, measure: number, beat: number): Beat | undefined {
  return song.tracks[track]?.measures[measure]?.beats[beat];
}

function stringCount(song: Song, track: number): number {
  return song.tracks[track]?.instrument.tuning.length ?? 0;
}

export function findNote(song: Song, pos: Position): Note | undefined {
  return getBeat(song, pos.track, pos.measure, pos.beat)?.notes.find((n) => n.string === pos.string);
}

function sortNotes(notes: Note[]) {
  notes.sort((a, b) => a.string - b.string);
}

// ---------- notes ----------

export function setNote(song: Song, pos: Position, fret: number): Song {
  if (!Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) return song;
  if (!getBeat(song, pos.track, pos.measure, pos.beat)) return song;
  if (pos.string < 0 || pos.string >= stringCount(song, pos.track)) return song;
  return produce(song, (draft) => {
    const beat = draft.tracks[pos.track].measures[pos.measure].beats[pos.beat];
    delete beat.rest;
    const existing = beat.notes.find((n) => n.string === pos.string);
    if (existing) {
      existing.fret = fret;
      delete existing.techniques.dead;
    } else {
      beat.notes.push({ string: pos.string, fret, techniques: {} });
      sortNotes(beat.notes);
    }
  });
}

export function removeNote(song: Song, pos: Position): Song {
  if (!findNote(song, pos)) return song;
  return produce(song, (draft) => {
    const beat = draft.tracks[pos.track].measures[pos.measure].beats[pos.beat];
    beat.notes = beat.notes.filter((n) => n.string !== pos.string);
  });
}

/** Set (value) or clear (undefined / false) one technique on the note at pos. */
export function setTechnique<K extends keyof NoteTechniques>(song: Song, pos: Position, key: K, value: NoteTechniques[K] | undefined): Song {
  if (!findNote(song, pos)) return song;
  return produce(song, (draft) => {
    const note = draft.tracks[pos.track].measures[pos.measure].beats[pos.beat].notes.find((n) => n.string === pos.string)!;
    if (value === undefined || value === false) delete note.techniques[key];
    else note.techniques[key] = value;
    // Mutually exclusive pairs.
    if (key === 'slide' && value) delete note.techniques.legato;
    if (key === 'legato' && value) delete note.techniques.slide;
    if (key === 'bend' && !value) delete note.techniques.bendRelease;
  });
}

/** Move a note to another string keeping its pitch. No-op if the fret would be out of range or the target is occupied. */
export function moveNoteToString(song: Song, pos: Position, targetString: number): Song {
  const note = findNote(song, pos);
  const track = song.tracks[pos.track];
  if (!note || !track || targetString < 0 || targetString >= track.instrument.tuning.length) return song;
  const beat = getBeat(song, pos.track, pos.measure, pos.beat)!;
  if (beat.notes.some((n) => n.string === targetString)) return song;
  const { tuning } = track.instrument;
  const pitch = notePitch(tuning, 0, pos.string, note.fret);
  const fret = pitch - (pitchToMidi(tuning[targetString]) ?? 0);
  if (fret < 0 || fret > MAX_FRET) return song;
  return produce(song, (draft) => {
    const b = draft.tracks[pos.track].measures[pos.measure].beats[pos.beat];
    const n = b.notes.find((x) => x.string === pos.string)!;
    n.string = targetString;
    n.fret = fret;
    sortNotes(b.notes);
  });
}

// ---------- beats ----------

export type BeatProps = Pick<Beat, 'chord' | 'text' | 'stroke' | 'dynamic'>;

/** Set beat-level markings. Empty strings and undefined remove a marking. */
export function setBeatProps(song: Song, track: number, measure: number, beat: number, patch: Partial<BeatProps>): Song {
  const b = getBeat(song, track, measure, beat);
  if (!b) return song;
  const keys = Object.keys(patch) as (keyof BeatProps)[];
  // Blank strings remove a marking; others are kept as typed (trimming mid-typing would eat spaces).
  const norm = (v: unknown) => (typeof v === 'string' && !v.trim() ? undefined : v);
  if (keys.every((k) => norm(patch[k]) === b[k])) return song;
  return produce(song, (draft) => {
    const d = draft.tracks[track].measures[measure].beats[beat];
    for (const k of keys) {
      const v = norm(patch[k]);
      if (v === undefined) delete d[k];
      else (d as Record<string, unknown>)[k] = v;
    }
  });
}

/** Place a dead (muted, "x") note on a string, creating the note if the string is empty. */
export function setDeadNote(song: Song, pos: Position): Song {
  const existing = findNote(song, pos);
  if (existing?.techniques.dead) return song;
  const withNote = existing ? song : setNote(song, pos, 0);
  if (withNote === song && !existing) return song;
  return setTechnique(withNote, pos, 'dead', true);
}

export function setBeatDuration(song: Song, track: number, measure: number, beat: number, duration: Duration): Song {
  if (!getBeat(song, track, measure, beat)) return song;
  return produce(song, (draft) => {
    draft.tracks[track].measures[measure].beats[beat].duration = { ...duration };
  });
}

/** Make a beat a written rest (removing its notes), or turn a rest back into an empty beat. */
export function setRest(song: Song, track: number, measure: number, beat: number, rest: boolean): Song {
  const b = getBeat(song, track, measure, beat);
  if (!b || (rest && b.rest && b.notes.length === 0) || (!rest && !b.rest)) return song;
  return produce(song, (draft) => {
    const d = draft.tracks[track].measures[measure].beats[beat];
    if (rest) {
      d.notes = [];
      d.rest = true;
    } else delete d.rest;
  });
}

export function insertBeat(song: Song, track: number, measure: number, index: number, duration?: Duration): Song {
  const m = song.tracks[track]?.measures[measure];
  if (!m || index < 0 || index > m.beats.length) return song;
  return produce(song, (draft) => {
    draft.tracks[track].measures[measure].beats.splice(index, 0, createBeat(duration));
  });
}

export function insertBeats(song: Song, track: number, measure: number, index: number, beats: Beat[]): Song {
  const m = song.tracks[track]?.measures[measure];
  if (!m || index < 0 || index > m.beats.length || beats.length === 0) return song;
  return produce(song, (draft) => {
    draft.tracks[track].measures[measure].beats.splice(index, 0, ...beats.map(cloneBeat));
  });
}

/** Delete a beat. The last beat of a measure is replaced by an empty beat so a measure is never empty. */
export function deleteBeat(song: Song, track: number, measure: number, beat: number): Song {
  const m = song.tracks[track]?.measures[measure];
  if (!m || !m.beats[beat]) return song;
  return produce(song, (draft) => {
    const beats = draft.tracks[track].measures[measure].beats;
    if (beats.length === 1) beats[0] = createBeat(beats[0].duration);
    else beats.splice(beat, 1);
  });
}

export function moveBeat(song: Song, track: number, measure: number, from: number, to: number): Song {
  const m = song.tracks[track]?.measures[measure];
  if (!m || !m.beats[from] || to < 0 || to >= m.beats.length || from === to) return song;
  return produce(song, (draft) => {
    const beats = draft.tracks[track].measures[measure].beats;
    const [b] = beats.splice(from, 1);
    beats.splice(to, 0, b);
  });
}

// ---------- measures (applied to every track so measures stay aligned) ----------

export function insertMeasure(song: Song, index: number): Song {
  if (index < 0 || index > song.masterBars.length) return song;
  return produce(song, (draft) => {
    draft.masterBars.splice(index, 0, {});
    for (const t of draft.tracks) t.measures.splice(index, 0, createMeasure());
  });
}

export function deleteMeasure(song: Song, index: number): Song {
  if (index < 0 || index >= song.masterBars.length) return song;
  return produce(song, (draft) => {
    if (draft.masterBars.length === 1) {
      draft.masterBars[0] = {};
      for (const t of draft.tracks) t.measures[0] = createMeasure();
      return;
    }
    draft.masterBars.splice(index, 1);
    for (const t of draft.tracks) t.measures.splice(index, 1);
  });
}

export function moveMeasure(song: Song, from: number, to: number): Song {
  const n = song.masterBars.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return song;
  return produce(song, (draft) => {
    const [mb] = draft.masterBars.splice(from, 1);
    draft.masterBars.splice(to, 0, mb);
    for (const t of draft.tracks) {
      const [m] = t.measures.splice(from, 1);
      t.measures.splice(to, 0, m);
    }
  });
}

export function clearMeasure(song: Song, track: number, measure: number): Song {
  if (!song.tracks[track]?.measures[measure]) return song;
  return produce(song, (draft) => {
    draft.tracks[track].measures[measure] = createMeasure();
  });
}

// ---------- song settings ----------

export function isValidTimeSignature(ts: TimeSignature): boolean {
  return Number.isInteger(ts.numerator) && ts.numerator >= 1 && ts.numerator <= 32 && [2, 4, 8, 16].includes(ts.denominator);
}

export function setTimeSignature(song: Song, ts: TimeSignature): Song {
  if (!isValidTimeSignature(ts)) return song;
  return produce(song, (draft) => {
    draft.timeSignature = { ...ts };
  });
}

/** Set or clear (null) a time-signature change at a measure. */
export function setMeasureTimeSignature(song: Song, measure: number, ts: TimeSignature | null): Song {
  if (!song.masterBars[measure] || (ts && !isValidTimeSignature(ts))) return song;
  return produce(song, (draft) => {
    if (ts) draft.masterBars[measure].timeSignature = { ...ts };
    else delete draft.masterBars[measure].timeSignature;
  });
}

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

export function setTempo(song: Song, bpm: number): Song {
  if (!Number.isFinite(bpm)) return song;
  const tempo = Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, bpm)));
  if (tempo === song.tempo) return song;
  return produce(song, (draft) => {
    draft.tempo = tempo;
  });
}

export function setMeta(song: Song, patch: Partial<SongMeta>): Song {
  return produce(song, (draft) => {
    Object.assign(draft.meta, patch);
  });
}

export function setKeySignature(song: Song, key: string): Song {
  return produce(song, (draft) => {
    draft.keySignature = key;
  });
}

/** Change a track's tuning. Changing the string count drops notes on strings that no longer exist. */
export function setTuning(song: Song, track: number, tuning: string[]): Song {
  if (!song.tracks[track] || tuning.length < 4 || tuning.length > 8 || tuning.some((p) => pitchToMidi(p) === null)) return song;
  return produce(song, (draft) => {
    const t = draft.tracks[track];
    t.instrument.tuning = [...tuning];
    for (const m of t.measures) for (const b of m.beats) b.notes = b.notes.filter((n) => n.string < tuning.length);
  });
}

export function setCapo(song: Song, track: number, capo: number): Song {
  if (!song.tracks[track] || !Number.isInteger(capo) || capo < 0 || capo > MAX_CAPO) return song;
  return produce(song, (draft) => {
    draft.tracks[track].instrument.capo = capo;
  });
}

// ---------- tracks ----------

export function addTrack(song: Song, name: string, instrument?: Instrument): Song {
  return produce(song, (draft) => {
    draft.tracks.push(createTrack(name, draft.masterBars.length, instrument ? { ...instrument, tuning: [...instrument.tuning] } : undefined));
  });
}

export function removeTrack(song: Song, track: number): Song {
  if (song.tracks.length <= 1 || !song.tracks[track]) return song;
  return produce(song, (draft) => {
    draft.tracks.splice(track, 1);
  });
}

export function renameTrack(song: Song, track: number, name: string): Song {
  const trimmed = name.trim();
  if (!song.tracks[track] || !trimmed) return song;
  return produce(song, (draft) => {
    draft.tracks[track].name = trimmed;
  });
}
