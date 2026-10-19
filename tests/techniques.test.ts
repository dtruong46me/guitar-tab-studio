import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSong } from '../src/model/factory';
import { createDemoSong } from '../src/model/demo';
import { createNoiNayCoAnh } from '../src/model/examples/noiNayCoAnh';
import * as ops from '../src/model/operations';
import { durationTicks, measureCapacity } from '../src/model/duration';
import { createEditorState, editorReducer, type EditorAction, type EditorState } from '../src/editor/editor';
import { keyToIntent } from '../src/editor/keymap';
import { buildSchedule, DYNAMIC_GAIN } from '../src/audio/schedule';
import { layoutTrack } from '../src/layout/layout';
import { beatSequence, drawSystem } from '../src/layout/draw';
import type { Op } from '../src/layout/ops';
import { parseProject, serializeProject } from '../src/io/json';
import { paginate } from '../src/pdf/paginate';
import { pagesToPdf } from '../src/pdf/pdfWriter';

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const pos = (measure: number, beat: number, string: number) => ({ track: 0, measure, beat, string });
const allOps = (song: ReturnType<typeof createSong>) => {
  const layout = layoutTrack(song, 0, { width: 700, gap: 12 });
  const seq = beatSequence(song, layout);
  return layout.systems.flatMap((s) => drawSystem(song, layout, s, seq));
};
const texts = (list: Op[]) => list.flatMap((o) => (o.t === 'text' ? [o.text] : []));

describe('dead notes (string hits)', () => {
  it('X on an empty string writes a dead note; X again removes it', () => {
    let s = run(createEditorState(createSong()), { type: 'navigate', dir: 'down' }, { type: 'toggleTechnique', key: 'dead' });
    expect(s.song.tracks[0].measures[0].beats[0].notes).toEqual([{ string: 1, fret: 0, techniques: { dead: true } }]);
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'toggleTechnique', key: 'dead' });
    expect(s.song.tracks[0].measures[0].beats[0].notes[0].techniques.dead).toBeUndefined();
  });

  it('other techniques still need a note', () => {
    const s = run(createEditorState(createSong()), { type: 'toggleTechnique', key: 'vibrato' });
    expect(s.status).toMatch(/Select a note/);
  });
});

describe('beat markings', () => {
  it('sets and clears chord, text, strum and dynamics', () => {
    let song = ops.setBeatProps(createSong(), 0, 0, 0, { chord: 'Am7', text: 'Verse 1', stroke: 'down', dynamic: 'mf' });
    expect(song.tracks[0].measures[0].beats[0]).toMatchObject({ chord: 'Am7', text: 'Verse 1', stroke: 'down', dynamic: 'mf' });
    expect(ops.setBeatProps(song, 0, 0, 0, { chord: 'Am7' })).toBe(song);
    song = ops.setBeatProps(song, 0, 0, 0, { chord: '  ', stroke: undefined });
    expect(song.tracks[0].measures[0].beats[0].chord).toBeUndefined();
    expect(song.tracks[0].measures[0].beats[0].stroke).toBeUndefined();
  });

  it('toggles strums from the keyboard and merges typed text into one undo step', () => {
    let s = run(createEditorState(createSong()), { type: 'toggleStroke', dir: 'up' });
    expect(s.song.tracks[0].measures[0].beats[0].stroke).toBe('up');
    s = run(s, { type: 'toggleStroke', dir: 'up' });
    expect(s.song.tracks[0].measures[0].beats[0].stroke).toBeUndefined();
    const before = s.history.past.length;
    s = run(s, { type: 'setBeatProps', patch: { text: 'C' } }, { type: 'setBeatProps', patch: { text: 'Ch' } }, { type: 'setBeatProps', patch: { text: 'Cho rus' } });
    expect(s.song.tracks[0].measures[0].beats[0].text).toBe('Cho rus');
    expect(s.history.past.length).toBe(before + 1);
  });

  it('maps C, D, U and A shortcuts', () => {
    const key = (k: string, shiftKey = false) => keyToIntent({ key: k, ctrlKey: false, metaKey: false, shiftKey, altKey: false }, 0);
    expect(key('c')).toEqual({ kind: 'app', command: 'chord' });
    expect(key('d')).toEqual({ kind: 'editor', action: { type: 'toggleStroke', dir: 'down' } });
    expect(key('u')).toEqual({ kind: 'editor', action: { type: 'toggleStroke', dir: 'up' } });
    expect(key('A', true)).toEqual({ kind: 'editor', action: { type: 'setTechnique', key: 'accent', value: 'heavy' } });
  });

  it('draws chords, section text, dynamics, strum arrows and articulations', () => {
    let song = createSong('t', 1);
    song = ops.setNote(song, pos(0, 0, 1), 1);
    song = ops.setNote(song, pos(0, 0, 3), 2);
    song = ops.setBeatProps(song, 0, 0, 0, { chord: 'C', text: 'Intro', stroke: 'up', dynamic: 'p' });
    for (const [k, v] of [['accent', 'normal'], ['slap', true], ['grace', 3], ['trill', 5]] as const) song = ops.setTechnique(song, pos(0, 0, 1), k, v as never);
    const drawn = allOps(song);
    expect(texts(drawn)).toEqual(expect.arrayContaining(['C', 'Intro', 'p', '> S tr', '1(5)', '3']));
    // The strum arrow is a filled triangle.
    expect(drawn.some((o) => o.t === 'path' && o.fill)).toBe(true);
  });

  it('round-trips every new field through JSON', () => {
    let song = ops.setBeatProps(createSong(), 0, 0, 0, { chord: 'G/B', text: 'Outro', stroke: 'up', dynamic: 'ff' });
    song = ops.setNote(song, pos(0, 0, 0), 5);
    for (const [k, v] of [['accent', 'heavy'], ['staccato', true], ['grace', 3], ['trill', 7], ['tremolo', true], ['fadeIn', true], ['slap', true], ['pop', true], ['harmonic', 'pinch'], ['bend', 2], ['prebend', true]] as const)
      song = ops.setTechnique(song, pos(0, 0, 0), k, v as never);
    const r = parseProject(serializeProject(song));
    expect(r.ok && r.song.tracks).toEqual(song.tracks);
  });
});

describe('playback of new techniques', () => {
  const sched = (song: ReturnType<typeof createSong>) => buildSchedule(song, { tracks: [0], cursorTrack: 0 });

  it('applies dynamics until the next marking', () => {
    let song = createSong('t', 1);
    for (let b = 0; b < 3; b++) {
      if (b) song = ops.insertBeat(song, 0, 0, b);
      song = ops.setNote(song, pos(0, b, 0), b);
    }
    song = ops.setBeatProps(song, 0, 0, 0, { dynamic: 'p' });
    song = ops.setBeatProps(song, 0, 0, 2, { dynamic: 'ff' });
    const g = sched(song).events.map((e) => e.gain);
    expect(g[0]).toBeCloseTo(0.8 * DYNAMIC_GAIN.p);
    expect(g[1]).toBeCloseTo(0.8 * DYNAMIC_GAIN.p);
    expect(g[2]).toBeCloseTo(0.8 * DYNAMIC_GAIN.ff);
  });

  it('spreads a strum across the strings in the stroke direction', () => {
    let song = createSong('t', 1);
    for (const s of [0, 2, 5]) song = ops.setNote(song, pos(0, 0, s), 0);
    const down = sched(ops.setBeatProps(song, 0, 0, 0, { stroke: 'down' })).events;
    expect(down.map((e) => e.string)).toEqual([5, 2, 0]);
    const up = sched(ops.setBeatProps(song, 0, 0, 0, { stroke: 'up' })).events;
    expect(up.map((e) => e.string)).toEqual([0, 2, 5]);
    expect(up[2].time).toBeGreaterThan(up[0].time);
  });

  it('plays grace notes before the beat, trills and tremolo as repeated notes, staccato short', () => {
    let song = ops.setNote(createSong('t', 1), pos(0, 0, 0), 5);
    song = ops.setBeatDuration(song, 0, 0, 0, { value: 2, dotted: false });
    const grace = sched(ops.setTechnique(song, pos(0, 0, 0), 'grace', 3)).events;
    expect(grace).toHaveLength(2);
    expect(grace[0].midi).toBe(64 + 3);
    expect(grace[1].time).toBe(0);
    const trill = sched(ops.setTechnique(song, pos(0, 0, 0), 'trill', 7)).events;
    expect(trill.length).toBeGreaterThan(8);
    expect(new Set(trill.map((e) => e.midi))).toEqual(new Set([69, 71]));
    const trem = sched(ops.setTechnique(song, pos(0, 0, 0), 'tremolo', true)).events;
    expect(new Set(trem.map((e) => e.midi))).toEqual(new Set([69]));
    const stacc = sched(ops.setTechnique(song, pos(0, 0, 0), 'staccato', true)).events;
    expect(stacc[0].duration).toBeLessThan(0.5);
  });

  it('starts a pre-bend at the bent pitch', () => {
    let song = ops.setNote(createSong('t', 1), pos(0, 0, 1), 8);
    song = ops.setTechnique(song, pos(0, 0, 1), 'bend', 2);
    song = ops.setTechnique(song, pos(0, 0, 1), 'prebend', true);
    expect(sched(song).events[0].pitchCurve?.[0]).toEqual([0, 200]);
  });
});

describe('Nơi Này Có Anh example', () => {
  const song = createNoiNayCoAnh();

  it('has complete measures, chords and the slap hits', () => {
    expect(song.masterBars).toHaveLength(12);
    song.tracks[0].measures.forEach((m) => expect(m.beats.reduce((t, b) => t + durationTicks(b.duration), 0)).toBe(measureCapacity(song.timeSignature)));
    const beats = song.tracks[0].measures.flatMap((m) => m.beats);
    expect(beats.filter((b) => b.chord).map((b) => b.chord).slice(0, 8)).toEqual(['F', 'G', 'Am', 'Em', 'F', 'G', 'C', 'Em']);
    const slaps = beats.filter((b) => b.notes.some((n) => n.techniques.dead && n.string === 5));
    expect(slaps.length).toBe(3);
    expect(song.meta).toMatchObject({ title: 'Nơi Này Có Anh', artist: 'Sơn Tùng M-TP', tabbedBy: 'Sang Pham' });
  });

  it('exports to PDF with an embedded Unicode font for the Vietnamese title', () => {
    const dir = 'node_modules/@expo-google-fonts/inter';
    const b64 = (f: string) => readFileSync(`${dir}/${f}`).toString('base64');
    const fonts = {
      regular: b64('400Regular/Inter_400Regular.ttf'),
      italic: b64('400Regular_Italic/Inter_400Regular_Italic.ttf'),
      bold: b64('700Bold/Inter_700Bold.ttf'),
      boldItalic: b64('700Bold_Italic/Inter_700Bold_Italic.ttf'),
    };
    const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
    const raw = pagesToPdf(pages, song, { fonts, compress: false }).output();
    expect(raw).toMatch(/\/BaseFont \/Inter/);
    expect(raw).toContain('/Identity-H');
    expect(pages.flatMap((p) => p.ops).some((o) => o.t === 'text' && o.text === 'Nơi Này Có Anh')).toBe(true);
  });

  it('keeps the showcase example complete as well', () => {
    const demo = createDemoSong();
    demo.tracks[0].measures.forEach((m) => expect(m.beats.reduce((t, b) => t + durationTicks(b.duration), 0)).toBe(measureCapacity(demo.timeSignature)));
  });
});
