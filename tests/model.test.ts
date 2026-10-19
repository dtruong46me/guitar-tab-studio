import { describe, expect, it } from 'vitest';
import { createSong } from '../src/model/factory';
import * as ops from '../src/model/operations';
import { durationTicks, effectiveTimeSignatures, measureCapacity, stepDuration } from '../src/model/duration';
import { midiToPitch, notePitch, pitchToMidi } from '../src/model/tuning';

const pos = (measure: number, beat: number, string: number, track = 0) => ({ track, measure, beat, string });

describe('durations', () => {
  it('computes ticks for plain and dotted values', () => {
    expect(durationTicks({ value: 4, dotted: false })).toBe(960);
    expect(durationTicks({ value: 8, dotted: true })).toBe(720);
    expect(durationTicks({ value: 1, dotted: false })).toBe(3840);
  });

  it('computes measure capacity for common time signatures', () => {
    expect(measureCapacity({ numerator: 4, denominator: 4 })).toBe(3840);
    expect(measureCapacity({ numerator: 3, denominator: 4 })).toBe(2880);
    expect(measureCapacity({ numerator: 6, denominator: 8 })).toBe(2880);
  });

  it('steps durations within range', () => {
    expect(stepDuration(4, 1)).toBe(8);
    expect(stepDuration(16, 1)).toBe(16);
    expect(stepDuration(1, -1)).toBe(1);
  });
});

describe('tuning', () => {
  it('parses and formats pitches', () => {
    expect(pitchToMidi('E2')).toBe(40);
    expect(pitchToMidi('Bb1')).toBe(34);
    expect(pitchToMidi('nope')).toBeNull();
    expect(midiToPitch(64)).toBe('E4');
  });

  it('computes sounding pitch with capo', () => {
    expect(notePitch(['E4', 'B3', 'G3', 'D3', 'A2', 'E2'], 2, 5, 3)).toBe(45);
  });
});

describe('note operations', () => {
  it('adds, replaces and removes notes without mutating the input', () => {
    const song = createSong();
    const a = ops.setNote(song, pos(0, 0, 2), 5);
    expect(song.tracks[0].measures[0].beats[0].notes).toHaveLength(0);
    expect(a.tracks[0].measures[0].beats[0].notes).toEqual([{ string: 2, fret: 5, techniques: {} }]);
    const b = ops.setNote(a, pos(0, 0, 2), 7);
    expect(b.tracks[0].measures[0].beats[0].notes[0].fret).toBe(7);
    const c = ops.removeNote(b, pos(0, 0, 2));
    expect(c.tracks[0].measures[0].beats[0].notes).toHaveLength(0);
  });

  it('keeps notes sorted by string and rejects invalid input', () => {
    let song = createSong();
    song = ops.setNote(song, pos(0, 0, 4), 3);
    song = ops.setNote(song, pos(0, 0, 1), 1);
    expect(song.tracks[0].measures[0].beats[0].notes.map((n) => n.string)).toEqual([1, 4]);
    expect(ops.setNote(song, pos(0, 0, 9), 1)).toBe(song);
    expect(ops.setNote(song, pos(0, 0, 0), -1)).toBe(song);
    expect(ops.setNote(song, pos(0, 0, 0), 31)).toBe(song);
    expect(ops.setNote(song, pos(9, 0, 0), 1)).toBe(song);
  });

  it('sets techniques and keeps slide/legato exclusive', () => {
    let song = ops.setNote(createSong(), pos(0, 0, 0), 5);
    song = ops.setTechnique(song, pos(0, 0, 0), 'legato', true);
    song = ops.setTechnique(song, pos(0, 0, 0), 'slide', 'legato');
    const t = song.tracks[0].measures[0].beats[0].notes[0].techniques;
    expect(t.slide).toBe('legato');
    expect(t.legato).toBeUndefined();
    song = ops.setTechnique(song, pos(0, 0, 0), 'slide', undefined);
    expect(song.tracks[0].measures[0].beats[0].notes[0].techniques).toEqual({});
  });

  it('moves a note to another string keeping its pitch', () => {
    const song = ops.setNote(createSong(), pos(0, 0, 1), 0); // open B
    const moved = ops.moveNoteToString(song, pos(0, 0, 1), 2); // G string, fret 4
    expect(moved.tracks[0].measures[0].beats[0].notes).toEqual([{ string: 2, fret: 4, techniques: {} }]);
    // Open B cannot move up to the high E string (fret would be negative).
    expect(ops.moveNoteToString(song, pos(0, 0, 1), 0)).toBe(song);
  });
});

describe('beat operations', () => {
  it('inserts, moves and deletes beats; a measure never becomes empty', () => {
    let song = createSong();
    song = ops.setNote(song, pos(0, 0, 0), 1);
    song = ops.insertBeat(song, 0, 0, 1, { value: 8, dotted: false });
    song = ops.setNote(song, pos(0, 1, 0), 2);
    song = ops.moveBeat(song, 0, 0, 1, 0);
    expect(song.tracks[0].measures[0].beats.map((b) => b.notes[0]?.fret)).toEqual([2, 1]);
    song = ops.deleteBeat(song, 0, 0, 0);
    song = ops.deleteBeat(song, 0, 0, 0);
    expect(song.tracks[0].measures[0].beats).toHaveLength(1);
    expect(song.tracks[0].measures[0].beats[0].notes).toHaveLength(0);
  });

  it('makes a written rest, and entering a note removes it', () => {
    let song = ops.setNote(createSong(), pos(0, 0, 0), 3);
    song = ops.setRest(song, 0, 0, 0, true);
    expect(song.tracks[0].measures[0].beats[0]).toMatchObject({ notes: [], rest: true });
    expect(ops.setRest(song, 0, 0, 0, true)).toBe(song);
    song = ops.setNote(song, pos(0, 0, 2), 5);
    expect(song.tracks[0].measures[0].beats[0].rest).toBeUndefined();
    // New measures start as empty beats, not rests.
    expect(createSong().tracks[0].measures[0].beats[0].rest).toBeUndefined();
  });
});

describe('measure operations', () => {
  it('keeps measures aligned across tracks', () => {
    let song = ops.addTrack(createSong('x', 2), 'Second');
    song = ops.insertMeasure(song, 1);
    expect(song.masterBars).toHaveLength(3);
    expect(song.tracks.map((t) => t.measures.length)).toEqual([3, 3]);
    song = ops.deleteMeasure(song, 0);
    expect(song.tracks.map((t) => t.measures.length)).toEqual([2, 2]);
  });

  it('moves measures together with their time signature changes', () => {
    let song = createSong('x', 3);
    song = ops.setMeasureTimeSignature(song, 0, { numerator: 3, denominator: 4 });
    song = ops.setNote(song, pos(0, 0, 0), 9);
    song = ops.moveMeasure(song, 0, 2);
    expect(song.masterBars[2].timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(song.tracks[0].measures[2].beats[0].notes[0].fret).toBe(9);
  });

  it('resolves inherited time signatures', () => {
    let song = createSong('x', 4);
    song = ops.setMeasureTimeSignature(song, 2, { numerator: 6, denominator: 8 });
    expect(effectiveTimeSignatures(song).map((t) => `${t.numerator}/${t.denominator}`)).toEqual(['4/4', '4/4', '6/8', '6/8']);
  });

  it('never deletes the last measure', () => {
    let song = ops.setNote(createSong('x', 1), pos(0, 0, 0), 4);
    song = ops.deleteMeasure(song, 0);
    expect(song.masterBars).toHaveLength(1);
    expect(song.tracks[0].measures[0].beats[0].notes).toHaveLength(0);
  });
});

describe('song settings', () => {
  it('clamps tempo and validates time signatures', () => {
    const song = createSong();
    expect(ops.setTempo(song, 1000).tempo).toBe(400);
    expect(ops.setTempo(song, 5).tempo).toBe(20);
    expect(ops.setTimeSignature(song, { numerator: 0, denominator: 4 })).toBe(song);
    expect(ops.setTimeSignature(song, { numerator: 3, denominator: 4 }).timeSignature.numerator).toBe(3);
  });

  it('changing to fewer strings drops notes on removed strings', () => {
    let song = ops.setTuning(createSong(), 0, ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'B1']);
    song = ops.setNote(song, pos(0, 0, 6), 2);
    song = ops.setNote(song, pos(0, 0, 0), 1);
    song = ops.setTuning(song, 0, ['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    expect(song.tracks[0].measures[0].beats[0].notes.map((n) => n.string)).toEqual([0]);
    expect(ops.setTuning(song, 0, ['X9', 'B3', 'G3', 'D3'])).toBe(song);
  });

  it('validates capo and keeps at least one track', () => {
    const song = createSong();
    expect(ops.setCapo(song, 0, 3).tracks[0].instrument.capo).toBe(3);
    expect(ops.setCapo(song, 0, 13)).toBe(song);
    expect(ops.removeTrack(song, 0)).toBe(song);
  });
});
