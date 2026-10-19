import { describe, expect, it } from 'vitest';
import { buildSong } from '../src/model/demo';
import { createSong } from '../src/model/factory';
import * as ops from '../src/model/operations';
import { beatAt, buildSchedule, harmonicMidi } from '../src/audio/schedule';
import { keyToIntent } from '../src/editor/keymap';

const opts = { tracks: [0], cursorTrack: 0 };

describe('playback schedule', () => {
  it('times beats from tempo and durations', () => {
    // 120 BPM: a quarter note is 0.5 s.
    const song = buildSong('t', [[[4, [[0, 0]]], [4, [[0, 2]]], [2, [[0, 3]]]]]);
    const s = buildSchedule(song, opts);
    expect(s.beats.map((b) => b.time)).toEqual([0, 0.5, 1]);
    expect(s.events.map((e) => e.time)).toEqual([0, 0.5, 1]);
    expect(s.duration).toBeCloseTo(2);
    expect(s.events[0].midi).toBe(64); // open high E
  });

  it('applies capo, speed and the start measure', () => {
    let song = buildSong('t', [[[1, [[5, 0]]]], [[1, [[5, 3]]]]]);
    song = ops.setCapo(song, 0, 2);
    const s = buildSchedule(song, { ...opts, startMeasure: 1, speed: 2 });
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ time: 0, midi: 40 + 2 + 3 });
    expect(s.duration).toBeCloseTo(1);
  });

  it('clicks every beat with an accent on the downbeat, and dotted quarters in 6/8', () => {
    const four = buildSchedule(createSong('t', 1), opts);
    expect(four.clicks.map((c) => c.accent)).toEqual([true, false, false, false]);
    const six = buildSchedule(ops.setTimeSignature(createSong('t', 1), { numerator: 6, denominator: 8 }), opts);
    expect(six.clicks.map((c) => c.time)).toEqual([0, 0.75]);
  });

  it('cuts a ringing note when the string is played again, even a let ring one', () => {
    const song = buildSong('t', [[[4, [[0, 0]]], [4, [[0, 2]]], [4, [[1, 0, { letRing: true }]]], [4, [[1, 1]]]]]);
    const s = buildSchedule(song, opts);
    expect(s.events[0].duration).toBeCloseTo(0.5);
    expect(s.events[2].duration).toBeCloseTo(0.5);
  });

  it('lets a let ring note sound over other strings until a dead note mutes its string', () => {
    const ring = { letRing: true };
    const song = buildSong('t', [[[4, [[5, 3, ring]]], [4, [[2, 0, ring]]], [4, [[4, 0, { dead: true }], [5, 0, { dead: true }]]], [4, [[1, 1, ring]]]]]);
    const [bass, inner] = buildSchedule(song, opts).events;
    // The slap is percussion, not the end of the let ring: the G string keeps sounding.
    expect(inner.duration).toBeGreaterThan(1);
    // Rings through beat 2 and stops on the slap at beat 3.
    expect(bass.duration).toBeCloseTo(1);
  });

  it('stops let ring notes where the let ring ends', () => {
    const ring = { letRing: true };
    const song = buildSong('t', [[[4, [[5, 3, ring]]], [4, [[2, 0, ring]]], [4, [[1, 1]]], [4, [[0, 0, ring]]]]]);
    const [bass, inner, plain, last] = buildSchedule(song, opts).events;
    // Beat 3 is played without let ring: everything still ringing stops there.
    expect(bass.duration).toBeCloseTo(1);
    expect(inner.duration).toBeCloseTo(0.5);
    expect(plain.duration).toBeCloseTo(0.5);
    expect(last.duration).toBeGreaterThan(1);
  });

  it('extends tied notes instead of re-attacking', () => {
    const song = buildSong('t', [[[4, [[2, 5]]], [4, [[2, 5, { tie: true }]]]]]);
    const s = buildSchedule(song, opts);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].duration).toBeCloseTo(1);
  });

  it('softens hammer-ons, glides slides and shapes bends', () => {
    const song = buildSong('t', [[[4, [[0, 5, { legato: true }]]], [4, [[0, 7, { slide: 'legato' }]]], [4, [[0, 9]]], [4, [[0, 7, { bend: 2, bendRelease: true }]]]]]);
    const [a, b, c, d] = buildSchedule(song, opts).events;
    expect(b.gain).toBeLessThan(a.gain);
    expect(b.pitchCurve?.at(-1)?.[1]).toBe(200);
    expect(c.gain).toBeLessThan(a.gain);
    expect(d.pitchCurve?.map((p) => p[1])).toEqual([0, 200, 200, 0]);
  });

  it('uses the right timbre and pitch for harmonics, mutes and dead notes', () => {
    const song = buildSong('t', [[[4, [[5, 7, { harmonic: 'natural' }]]], [4, [[5, 3, { palmMute: true }]]], [4, [[5, 3, { dead: true }]]], [4, [[5, 3, { ghost: true }]]]]]);
    const [h, m, d, g] = buildSchedule(song, opts).events;
    expect(h).toMatchObject({ timbre: 'harmonic', midi: harmonicMidi(40, 7) });
    expect(harmonicMidi(40, 7)).toBe(59);
    expect(m.timbre).toBe('muted');
    expect(d.timbre).toBe('dead');
    expect(g.gain).toBeLessThan(0.5);
  });

  it('mixes all tracks but follows the cursor track for the playhead', () => {
    let song = buildSong('t', [[[2, [[0, 1]]], [2, [[0, 2]]]]]);
    song = ops.addTrack(song, 'Two');
    const s = buildSchedule(song, { tracks: [0, 1], cursorTrack: 1 });
    expect(s.events).toHaveLength(2);
    expect(s.beats).toEqual([{ time: 0, measure: 0, beat: 0 }]);
  });

  it('finds the beat playing at a time', () => {
    const beats = [0, 0.5, 1].map((time, beat) => ({ time, measure: 0, beat }));
    expect(beatAt(beats, -0.1)).toBe(-1);
    expect(beatAt(beats, 0)).toBe(0);
    expect(beatAt(beats, 0.75)).toBe(1);
    expect(beatAt(beats, 9)).toBe(2);
  });
});

describe('playback and duration shortcuts', () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => keyToIntent({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra }, 0);
  it('maps Space, Shift+Space, M and Shift+number', () => {
    expect(key(' ')).toEqual({ kind: 'app', command: 'playPause' });
    expect(key(' ', { shiftKey: true })).toEqual({ kind: 'app', command: 'stop' });
    expect(key('m')).toEqual({ kind: 'app', command: 'metronome' });
    expect(key('!', { shiftKey: true, code: 'Digit1' })).toEqual({ kind: 'editor', action: { type: 'setDuration', value: 1 } });
    expect(key('%', { shiftKey: true, code: 'Digit5' })).toEqual({ kind: 'editor', action: { type: 'setDuration', value: 16 } });
    expect(key('3')).toEqual({ kind: 'editor', action: { type: 'digit', digit: 3, now: 0 } });
  });
});
