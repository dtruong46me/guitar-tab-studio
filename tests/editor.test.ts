import { describe, expect, it } from 'vitest';
import { createSong } from '../src/model/factory';
import { createEditorState, editorReducer, isDirty, type EditorAction, type EditorState } from '../src/editor/editor';
import { keyToIntent } from '../src/editor/keymap';
import { pushHistory, emptyHistory, HISTORY_LIMIT } from '../src/editor/history';

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const notesAt = (s: EditorState, m: number, b: number) => s.song.tracks[0].measures[m].beats[b].notes;

describe('fret entry', () => {
  it('enters a single digit fret at the cursor', () => {
    const s = run(createEditorState(createSong()), { type: 'digit', digit: 7, now: 0 });
    expect(notesAt(s, 0, 0)).toEqual([{ string: 0, fret: 7, techniques: {} }]);
  });

  it('combines two quick digits into one fret and one undo step', () => {
    let s = run(createEditorState(createSong()), { type: 'digit', digit: 1, now: 0 }, { type: 'digit', digit: 2, now: 300 });
    expect(notesAt(s, 0, 0)[0].fret).toBe(12);
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(notesAt(s, 0, 0)).toHaveLength(0);
  });

  it('treats slow digits or out-of-range combinations as new frets', () => {
    const slow = run(createEditorState(createSong()), { type: 'digit', digit: 1, now: 0 }, { type: 'digit', digit: 2, now: 5000 });
    expect(notesAt(slow, 0, 0)[0].fret).toBe(2);
    const big = run(createEditorState(createSong()), { type: 'digit', digit: 4, now: 0 }, { type: 'digit', digit: 5, now: 100 });
    expect(notesAt(big, 0, 0)[0].fret).toBe(5);
  });
});

describe('undo / redo', () => {
  it('restores song and cursor exactly', () => {
    const start = createEditorState(createSong());
    let s = run(start, { type: 'digit', digit: 3, now: 0 }, { type: 'navigate', dir: 'down' }, { type: 'digit', digit: 5, now: 5000 });
    expect(notesAt(s, 0, 0)).toHaveLength(2);
    s = run(s, { type: 'undo' });
    expect(notesAt(s, 0, 0)).toHaveLength(1);
    expect(s.cursor.string).toBe(1);
    s = run(s, { type: 'undo' });
    expect(s.song).toBe(start.song);
    s = run(s, { type: 'redo' }, { type: 'redo' });
    expect(notesAt(s, 0, 0).map((n) => n.fret)).toEqual([3, 5]);
    expect(run(s, { type: 'redo' })).toBe(s);
  });

  it('clears redo after a new edit and ignores no-op commands', () => {
    let s = run(createEditorState(createSong()), { type: 'digit', digit: 3, now: 0 }, { type: 'undo' });
    expect(s.history.future).toHaveLength(1);
    s = run(s, { type: 'digit', digit: 4, now: 9000 });
    expect(s.history.future).toHaveLength(0);
    const before = s.history.past.length;
    s = run(s, { type: 'deleteNote' }, { type: 'deleteNote' });
    expect(s.history.past.length).toBe(before + 1);
  });

  it('caps history length', () => {
    let h = emptyHistory();
    const song = createSong();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) h = pushHistory(h, { song, cursor: { track: 0, measure: 0, beat: 0, string: 0 }, label: 'x', time: i * 10000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('navigation', () => {
  it('right at the end of a measure adds beats until full, then moves on', () => {
    let s = createEditorState(createSong('x', 2));
    s = run(s, { type: 'navigate', dir: 'right' }, { type: 'navigate', dir: 'right' }, { type: 'navigate', dir: 'right' });
    expect(s.song.tracks[0].measures[0].beats).toHaveLength(4);
    expect(s.cursor).toMatchObject({ measure: 0, beat: 3 });
    s = run(s, { type: 'navigate', dir: 'right' });
    expect(s.cursor).toMatchObject({ measure: 1, beat: 0 });
  });

  it('right past the last full measure appends a measure', () => {
    let s = createEditorState(createSong('x', 1));
    s = run(s, { type: 'setDuration', value: 1 }, { type: 'navigate', dir: 'right' });
    expect(s.song.masterBars).toHaveLength(2);
    expect(s.cursor).toMatchObject({ measure: 1, beat: 0 });
  });

  it('clamps strings and stops at the song start', () => {
    let s = createEditorState(createSong());
    s = run(s, { type: 'navigate', dir: 'up' }, { type: 'navigate', dir: 'left' });
    expect(s.cursor).toMatchObject({ measure: 0, beat: 0, string: 0 });
    for (let i = 0; i < 10; i++) s = run(s, { type: 'navigate', dir: 'down' });
    expect(s.cursor.string).toBe(5);
  });
});

describe('beat editing', () => {
  it('changes durations of the selected beat', () => {
    const s = run(createEditorState(createSong()), { type: 'stepDuration', dir: 1 }, { type: 'toggleDot' });
    expect(s.song.tracks[0].measures[0].beats[0].duration).toEqual({ value: 8, dotted: true });
    expect(s.inputDuration).toEqual({ value: 8, dotted: true });
  });

  it('copies and pastes beats after the cursor', () => {
    let s = run(createEditorState(createSong()), { type: 'digit', digit: 5, now: 0 }, { type: 'copyBeat' }, { type: 'paste' });
    expect(s.song.tracks[0].measures[0].beats.map((b) => b.notes[0]?.fret)).toEqual([5, 5]);
    expect(s.cursor.beat).toBe(1);
    const ids = s.song.tracks[0].measures[0].beats.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    s = run(s, { type: 'cutBeat' });
    expect(s.song.tracks[0].measures[0].beats).toHaveLength(1);
  });

  it('toggles techniques only when a note is selected', () => {
    let s = run(createEditorState(createSong()), { type: 'toggleTechnique', key: 'vibrato' });
    expect(s.status).toMatch(/Select a note/);
    s = run(s, { type: 'digit', digit: 5, now: 0 }, { type: 'toggleTechnique', key: 'vibrato' });
    expect(notesAt(s, 0, 0)[0].techniques.vibrato).toBe(true);
    s = run(s, { type: 'setTechnique', key: 'bend', value: 2 }, { type: 'setTechnique', key: 'bend', value: 2 });
    expect(notesAt(s, 0, 0)[0].techniques.bend).toBeUndefined();
  });

  it('inserts and deletes measures at the cursor', () => {
    let s = run(createEditorState(createSong('x', 2)), { type: 'insertMeasure', after: true });
    expect(s.song.masterBars).toHaveLength(3);
    expect(s.cursor.measure).toBe(1);
    s = run(s, { type: 'deleteMeasure' });
    expect(s.song.masterBars).toHaveLength(2);
  });
});

describe('dirty tracking', () => {
  it('is clean after load/save and dirty after edits', () => {
    let s = createEditorState(createSong(), true);
    expect(isDirty(s)).toBe(false);
    s = run(s, { type: 'digit', digit: 1, now: 0 });
    expect(isDirty(s)).toBe(true);
    s = run(s, { type: 'markSaved', song: s.song });
    expect(isDirty(s)).toBe(false);
    s = run(s, { type: 'undo' });
    expect(isDirty(s)).toBe(true);
  });
});

describe('keymap', () => {
  const key = (k: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
    keyToIntent({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }, 42);

  it('maps the core shortcuts', () => {
    expect(key('7')).toEqual({ kind: 'editor', action: { type: 'digit', digit: 7, now: 42 } });
    expect(key('z', { ctrlKey: true })).toEqual({ kind: 'editor', action: { type: 'undo' } });
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toEqual({ kind: 'editor', action: { type: 'redo' } });
    expect(key('y', { metaKey: true })).toEqual({ kind: 'editor', action: { type: 'redo' } });
    expect(key('s', { ctrlKey: true })).toEqual({ kind: 'app', command: 'save' });
    expect(key('Delete', { shiftKey: true })).toEqual({ kind: 'editor', action: { type: 'deleteBeat' } });
    expect(key('ArrowRight', { altKey: true })).toEqual({ kind: 'editor', action: { type: 'moveBeat', dir: 1 } });
    expect(key('h')).toEqual({ kind: 'editor', action: { type: 'toggleTechnique', key: 'legato' } });
    expect(key('F5')).toBeNull();
  });
});
