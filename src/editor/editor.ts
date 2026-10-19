/**
 * Editor state machine: the song, cursor, history and input state, driven by high-level actions.
 * Pure and framework-free so it can be unit tested; the UI wires it to React with useReducer.
 */
import type { Beat, Duration, DurationValue, NoteTechniques, Position, Song, Stroke } from '../model/types';
import type { BeatProps } from '../model/operations';
import { durationTicks, effectiveTimeSignatures, measureCapacity, stepDuration } from '../model/duration';
import { findNote } from '../model/operations';
import { MAX_FRET } from '../model/tuning';
import * as cmd from './commands';
import type { Command } from './commands';
import { emptyHistory, pushHistory, type History } from './history';

export interface PendingDigit {
  key: string;
  value: number;
  time: number;
}

export interface EditorState {
  song: Song;
  cursor: Position;
  history: History;
  /** The song as last saved; `song !== savedSong` means unsaved changes. */
  savedSong: Song | null;
  /** Duration used for newly created beats. */
  inputDuration: Duration;
  clipboard: Beat[] | null;
  pendingDigit: PendingDigit | null;
  /** Last user-facing message (e.g. why an action did nothing). */
  status: string;
}

export type NavDir = 'left' | 'right' | 'up' | 'down' | 'nextMeasure' | 'prevMeasure' | 'measureStart' | 'measureEnd' | 'songStart' | 'songEnd';

export type BooleanTechnique = 'legato' | 'vibrato' | 'palmMute' | 'letRing' | 'tapped' | 'ghost' | 'tie' | 'dead' | 'slap' | 'pop' | 'staccato' | 'tremolo' | 'fadeIn' | 'prebend';

export type EditorAction =
  | { type: 'load'; song: Song; saved: boolean }
  | { type: 'exec'; command: Command; cursor?: Position }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'setCursor'; pos: Position }
  | { type: 'navigate'; dir: NavDir }
  | { type: 'digit'; digit: number; now: number }
  | { type: 'setFret'; fret: number }
  | { type: 'deleteNote' }
  | { type: 'deleteBeat' }
  | { type: 'insertBeat' }
  | { type: 'makeRest' }
  | { type: 'setDuration'; value: DurationValue }
  | { type: 'stepDuration'; dir: 1 | -1 }
  | { type: 'toggleDot' }
  | { type: 'toggleTechnique'; key: BooleanTechnique }
  | { type: 'toggleStroke'; dir: Stroke }
  | { type: 'setBeatProps'; patch: Partial<BeatProps> }
  | { type: 'setTechnique'; key: keyof NoteTechniques; value: NoteTechniques[keyof NoteTechniques] | undefined }
  | { type: 'moveBeat'; dir: -1 | 1 }
  | { type: 'moveNoteString'; dir: -1 | 1 }
  | { type: 'copyBeat' }
  | { type: 'cutBeat' }
  | { type: 'paste' }
  | { type: 'insertMeasure'; after: boolean }
  | { type: 'deleteMeasure' }
  | { type: 'moveMeasure'; dir: -1 | 1 }
  | { type: 'selectTrack'; track: number }
  | { type: 'markSaved'; song: Song };

export function createEditorState(song: Song, saved = false): EditorState {
  return {
    song,
    cursor: { track: 0, measure: 0, beat: 0, string: 0 },
    history: emptyHistory(),
    savedSong: saved ? song : null,
    inputDuration: { value: 4, dotted: false },
    clipboard: null,
    pendingDigit: null,
    status: '',
  };
}

export const isDirty = (s: EditorState) => s.song !== s.savedSong;

/** Clamp a position to something that exists in the song. */
export function clampPosition(song: Song, pos: Position): Position {
  const track = Math.min(Math.max(0, pos.track), song.tracks.length - 1);
  const t = song.tracks[track];
  const measure = Math.min(Math.max(0, pos.measure), t.measures.length - 1);
  const beat = Math.min(Math.max(0, pos.beat), t.measures[measure].beats.length - 1);
  const string = Math.min(Math.max(0, pos.string), t.instrument.tuning.length - 1);
  return { track, measure, beat, string };
}

export function measureTicks(song: Song, track: number, measure: number): number {
  return song.tracks[track].measures[measure].beats.reduce((sum, b) => sum + durationTicks(b.duration), 0);
}

export function measureFill(song: Song, track: number, measure: number): { used: number; capacity: number } {
  const ts = effectiveTimeSignatures(song)[measure];
  return { used: measureTicks(song, track, measure), capacity: measureCapacity(ts) };
}

function currentBeat(s: EditorState): Beat {
  const { track, measure, beat } = s.cursor;
  return s.song.tracks[track].measures[measure].beats[beat];
}

/** Run a command; no-op results are dropped so they don't pollute the history. */
function exec(s: EditorState, command: Command, cursor?: Position, now = Date.now()): EditorState {
  const song = command.apply(s.song);
  if (song === s.song) return cursor ? { ...s, cursor: clampPosition(s.song, cursor) } : s;
  return {
    ...s,
    song,
    history: pushHistory(s.history, { song: s.song, cursor: s.cursor, label: command.label, mergeKey: command.mergeKey, time: now }),
    cursor: clampPosition(song, cursor ?? s.cursor),
    status: '',
  };
}

function navigate(s: EditorState, dir: NavDir): EditorState {
  const { song, cursor } = s;
  const t = song.tracks[cursor.track];
  const lastMeasure = t.measures.length - 1;
  const beatsIn = (m: number) => t.measures[m].beats.length;
  const at = (measure: number, beat: number): EditorState => ({ ...s, cursor: { ...cursor, measure, beat }, pendingDigit: null });
  switch (dir) {
    case 'up':
      return { ...s, cursor: { ...cursor, string: Math.max(0, cursor.string - 1) }, pendingDigit: null };
    case 'down':
      return { ...s, cursor: { ...cursor, string: Math.min(t.instrument.tuning.length - 1, cursor.string + 1) }, pendingDigit: null };
    case 'left':
      if (cursor.beat > 0) return at(cursor.measure, cursor.beat - 1);
      if (cursor.measure > 0) return at(cursor.measure - 1, beatsIn(cursor.measure - 1) - 1);
      return s;
    case 'right': {
      if (cursor.beat < beatsIn(cursor.measure) - 1) return at(cursor.measure, cursor.beat + 1);
      // At the end of a measure: grow it while there is room, otherwise continue in the next measure.
      const { used, capacity } = measureFill(song, cursor.track, cursor.measure);
      const d = currentBeat(s).duration;
      if (used + durationTicks(d) <= capacity) {
        return { ...exec(s, cmd.insertBeat(cursor.track, cursor.measure, cursor.beat + 1, d), { ...cursor, beat: cursor.beat + 1 }), pendingDigit: null };
      }
      if (cursor.measure < lastMeasure) return at(cursor.measure + 1, 0);
      return { ...exec(s, cmd.insertMeasure(lastMeasure + 1), { ...cursor, measure: lastMeasure + 1, beat: 0 }), pendingDigit: null };
    }
    case 'nextMeasure':
      if (cursor.measure < lastMeasure) return at(cursor.measure + 1, 0);
      return { ...exec(s, cmd.insertMeasure(lastMeasure + 1), { ...cursor, measure: lastMeasure + 1, beat: 0 }), pendingDigit: null };
    case 'prevMeasure':
      return cursor.beat > 0 ? at(cursor.measure, 0) : cursor.measure > 0 ? at(cursor.measure - 1, 0) : s;
    case 'measureStart':
      return at(cursor.measure, 0);
    case 'measureEnd':
      return at(cursor.measure, beatsIn(cursor.measure) - 1);
    case 'songStart':
      return at(0, 0);
    case 'songEnd':
      return at(lastMeasure, beatsIn(lastMeasure) - 1);
  }
}

const posKey = (p: Position) => `${p.track}:${p.measure}:${p.beat}:${p.string}`;

function enterDigit(s: EditorState, digit: number, now: number): EditorState {
  const key = posKey(s.cursor);
  const p = s.pendingDigit;
  if (p && p.key === key && now - p.time < 1000 && p.value * 10 + digit <= MAX_FRET && p.value > 0) {
    const fret = p.value * 10 + digit;
    return { ...exec(s, cmd.setFret(s.cursor, fret, true), undefined, now), pendingDigit: null };
  }
  return { ...exec(s, cmd.setFret(s.cursor, digit, true), undefined, now), pendingDigit: { key, value: digit, time: now } };
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const c = s.cursor;
  switch (a.type) {
    case 'load':
      return { ...createEditorState(a.song, a.saved), inputDuration: s.inputDuration, clipboard: s.clipboard };
    case 'exec':
      return exec(s, a.command, a.cursor);
    case 'undo': {
      const entry = s.history.past[s.history.past.length - 1];
      if (!entry) return s;
      const redo = { ...entry, song: s.song, cursor: s.cursor };
      return {
        ...s,
        song: entry.song,
        cursor: clampPosition(entry.song, entry.cursor),
        history: { past: s.history.past.slice(0, -1), future: [...s.history.future, redo] },
        pendingDigit: null,
        status: `Undid: ${entry.label}`,
      };
    }
    case 'redo': {
      const entry = s.history.future[s.history.future.length - 1];
      if (!entry) return s;
      const undo = { ...entry, song: s.song, cursor: s.cursor, mergeKey: undefined };
      return {
        ...s,
        song: entry.song,
        cursor: clampPosition(entry.song, entry.cursor),
        history: { past: [...s.history.past, undo], future: s.history.future.slice(0, -1) },
        pendingDigit: null,
        status: `Redid: ${entry.label}`,
      };
    }
    case 'setCursor':
      return { ...s, cursor: clampPosition(s.song, a.pos), pendingDigit: null };
    case 'navigate':
      return navigate(s, a.dir);
    case 'digit':
      return enterDigit(s, a.digit, a.now);
    case 'setFret':
      return exec(s, cmd.setFret(c, a.fret));
    case 'deleteNote': {
      if (findNote(s.song, c)) return exec(s, cmd.removeNote(c));
      return s;
    }
    case 'deleteBeat':
      return exec(s, cmd.deleteBeat(c), { ...c, beat: Math.max(0, c.beat - (c.beat === currentBeatsLength(s) - 1 ? 1 : 0)) });
    case 'insertBeat':
      return exec(s, cmd.insertBeat(c.track, c.measure, c.beat, s.inputDuration));
    case 'makeRest': {
      // R toggles: a written rest goes back to an empty beat.
      const b = currentBeat(s);
      return exec(s, cmd.setRest(c, !(b.rest && b.notes.length === 0)));
    }
    case 'setDuration': {
      const d = { ...currentBeat(s).duration, value: a.value };
      return { ...exec(s, cmd.setBeatDuration(c, d)), inputDuration: d };
    }
    case 'stepDuration': {
      const cur = currentBeat(s).duration;
      const d = { ...cur, value: stepDuration(cur.value, a.dir) };
      return { ...exec(s, cmd.setBeatDuration(c, d)), inputDuration: d };
    }
    case 'toggleDot': {
      const cur = currentBeat(s).duration;
      const d = { ...cur, dotted: !cur.dotted };
      return { ...exec(s, cmd.setBeatDuration(c, d)), inputDuration: d };
    }
    case 'toggleTechnique': {
      const note = findNote(s.song, c);
      // A dead note needs no fret: X on an empty string writes one directly (percussive hits).
      if (a.key === 'dead' && !note) return exec(s, cmd.setDeadNote(c));
      if (!note) return { ...s, status: 'Select a note to apply a technique.' };
      return exec(s, cmd.setTechnique(c, a.key, note.techniques[a.key] ? undefined : true));
    }
    case 'setTechnique': {
      const note = findNote(s.song, c);
      if (!note) return { ...s, status: 'Select a note to apply a technique.' };
      // Setting the value a note already has toggles it off (keyboard shortcuts rely on this).
      const value = note.techniques[a.key] === a.value ? undefined : a.value;
      return exec(s, cmd.setTechnique(c, a.key, value as never));
    }
    case 'toggleStroke': {
      const b = currentBeat(s);
      return exec(s, cmd.setBeatProps(c, { stroke: b.stroke === a.dir ? undefined : a.dir }));
    }
    case 'setBeatProps':
      return exec(s, cmd.setBeatProps(c, a.patch));
    case 'moveBeat':
      return exec(s, cmd.moveBeat(c, c.beat + a.dir), { ...c, beat: c.beat + a.dir });
    case 'moveNoteString': {
      const next = exec(s, cmd.moveNoteToString(c, c.string + a.dir), { ...c, string: c.string + a.dir });
      return next.song === s.song ? { ...s, status: 'The note cannot move to that string.' } : next;
    }
    case 'copyBeat':
      return { ...s, clipboard: [currentBeat(s)], status: 'Beat copied.' };
    case 'cutBeat':
      return { ...editorReducer(s, { type: 'deleteBeat' }), clipboard: [currentBeat(s)], status: 'Beat cut.' };
    case 'paste': {
      if (!s.clipboard) return { ...s, status: 'Nothing to paste.' };
      const strings = s.song.tracks[c.track].instrument.tuning.length;
      const beats = s.clipboard.map((b) => ({ ...b, notes: b.notes.filter((n) => n.string < strings) }));
      return exec(s, cmd.insertBeats(c.track, c.measure, c.beat + 1, beats), { ...c, beat: c.beat + beats.length });
    }
    case 'insertMeasure': {
      const index = a.after ? c.measure + 1 : c.measure;
      return exec(s, cmd.insertMeasure(index), { ...c, measure: index, beat: 0 });
    }
    case 'deleteMeasure':
      return exec(s, cmd.deleteMeasure(c.measure), { ...c, measure: Math.min(c.measure, s.song.masterBars.length - 2), beat: 0 });
    case 'moveMeasure':
      return exec(s, cmd.moveMeasure(c.measure, c.measure + a.dir), { ...c, measure: c.measure + a.dir });
    case 'selectTrack':
      return { ...s, cursor: clampPosition(s.song, { ...c, track: a.track }), pendingDigit: null };
    case 'markSaved':
      return { ...s, savedSong: a.song };
  }
}

function currentBeatsLength(s: EditorState): number {
  return s.song.tracks[s.cursor.track].measures[s.cursor.measure].beats.length;
}
