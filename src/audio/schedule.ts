/**
 * Playback schedule: turns a Song into timed note events, beat positions and metronome clicks.
 * Pure (no Web Audio), so timing and technique handling are unit-testable.
 */
import type { Note, Song } from '../model/types';
import { durationTicks, effectiveTempos, effectiveTimeSignatures, TICKS_PER_QUARTER } from '../model/duration';
import { notePitch } from '../model/tuning';

export type Timbre = 'pluck' | 'muted' | 'harmonic' | 'dead';

export interface NoteEvent {
  time: number;
  /** How long the note sounds before it is released, in seconds. */
  duration: number;
  midi: number;
  gain: number;
  timbre: Timbre;
  track: number;
  string: number;
  /** Pitch movement in cents relative to `midi`, as [offset seconds, cents] points. */
  pitchCurve?: [number, number][];
  vibrato?: boolean;
}

export interface BeatTime {
  time: number;
  measure: number;
  beat: number;
}

export interface Click {
  time: number;
  accent: boolean;
}

export interface Schedule {
  events: NoteEvent[];
  /** Beats of the highlighted track, in time order. */
  beats: BeatTime[];
  clicks: Click[];
  duration: number;
}

export interface ScheduleOptions {
  /** Tracks to sound. */
  tracks: number[];
  /** Track whose beats drive the playhead. */
  cursorTrack: number;
  startMeasure?: number;
  /** Playback speed multiplier (1 = written tempo). */
  speed?: number;
}

/** Semitones above the open string for natural harmonics at common nodes. */
const HARMONIC_INTERVAL: Record<number, number> = { 12: 12, 24: 24, 7: 19, 19: 19, 5: 24, 4: 28, 9: 28, 16: 28, 3: 31 };

const LET_RING_SECONDS = 4;

export function harmonicMidi(openMidi: number, fret: number): number {
  return openMidi + (HARMONIC_INTERVAL[fret] ?? 12);
}

export function buildSchedule(song: Song, opts: ScheduleOptions): Schedule {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const start = Math.max(0, Math.min(opts.startMeasure ?? 0, song.masterBars.length - 1));
  const tempos = effectiveTempos(song);
  const sigs = effectiveTimeSignatures(song);

  // Start time of every measure, from the start measure on.
  const measureStart: number[] = [];
  let t = 0;
  for (let m = start; m < song.masterBars.length; m++) {
    measureStart[m] = t;
    const secPerTick = 60 / (tempos[m] * speed) / TICKS_PER_QUARTER;
    const ticks = (TICKS_PER_QUARTER * 4 * sigs[m].numerator) / sigs[m].denominator;
    // A measure lasts as long as its time signature, or longer if it is overfull in any played track.
    let longest = ticks;
    for (const ti of opts.tracks) {
      const used = song.tracks[ti]?.measures[m]?.beats.reduce((s, b) => s + durationTicks(b.duration), 0) ?? 0;
      longest = Math.max(longest, used);
    }
    t += longest * secPerTick;
  }
  const total = t;

  const clicks: Click[] = [];
  for (let m = start; m < song.masterBars.length; m++) {
    const ts = sigs[m];
    const secPerTick = 60 / (tempos[m] * speed) / TICKS_PER_QUARTER;
    // Compound meters click on the dotted quarter; others on the written beat unit.
    const compound = ts.denominator === 8 && ts.numerator % 3 === 0 && ts.numerator > 3;
    const clickTicks = compound ? (TICKS_PER_QUARTER * 4 * 3) / 8 : (TICKS_PER_QUARTER * 4) / ts.denominator;
    const count = compound ? ts.numerator / 3 : ts.numerator;
    for (let i = 0; i < count; i++) clicks.push({ time: measureStart[m] + i * clickTicks * secPerTick, accent: i === 0 });
  }

  const events: NoteEvent[] = [];
  const beats: BeatTime[] = [];
  const slideOuts: { ev: NoteEvent; dir: 'up' | 'down' }[] = [];

  for (const ti of opts.tracks) {
    const track = song.tracks[ti];
    if (!track) continue;
    const { tuning, capo } = track.instrument;
    // Last event per string, to extend ties, cut notes and apply legato.
    const lastOnString = new Map<number, { ev: NoteEvent; note: Note }>();

    for (let m = start; m < song.masterBars.length; m++) {
      const secPerTick = 60 / (tempos[m] * speed) / TICKS_PER_QUARTER;
      let tick = 0;
      track.measures[m].beats.forEach((beat, bi) => {
        const time = measureStart[m] + tick * secPerTick;
        const dur = durationTicks(beat.duration) * secPerTick;
        tick += durationTicks(beat.duration);
        if (ti === opts.cursorTrack) beats.push({ time, measure: m, beat: bi });

        for (const note of beat.notes) {
          const tech = note.techniques;
          const prev = lastOnString.get(note.string);
          const midi = notePitch(tuning, capo, note.string, note.fret);

          if (tech.tie && prev && prev.ev.midi === midi && !tech.dead) {
            prev.ev.duration = Math.max(prev.ev.duration, time + dur - prev.ev.time);
            continue;
          }
          // Legato only connects notes that follow each other directly on the string.
          const adjacent = !!prev && prev.ev.time + prev.ev.duration >= time - 0.05;
          const legatoFromPrev = adjacent && !!(prev.note.techniques.legato || prev.note.techniques.slide === 'legato');
          // A new note on the string stops the previous one unless it rings over.
          if (prev && !prev.note.techniques.letRing) prev.ev.duration = Math.min(prev.ev.duration, Math.max(0.02, time - prev.ev.time));

          let timbre: Timbre = 'pluck';
          let eventMidi = midi;
          if (tech.dead) timbre = 'dead';
          else if (tech.harmonic) {
            timbre = 'harmonic';
            eventMidi = tech.harmonic === 'natural' ? harmonicMidi(notePitch(tuning, capo, note.string, 0), note.fret) : midi + 12;
          } else if (tech.palmMute) timbre = 'muted';

          let gain = 0.8;
          if (tech.ghost) gain = 0.3;
          if (legatoFromPrev || tech.tapped) gain *= 0.65;

          const ev: NoteEvent = {
            time,
            duration: tech.letRing ? Math.max(dur, LET_RING_SECONDS) : tech.dead ? Math.min(dur, 0.08) : timbre === 'muted' ? Math.min(dur, 0.25) : dur,
            midi: eventMidi,
            gain,
            timbre,
            track: ti,
            string: note.string,
          };
          if (tech.bend) {
            const cents = tech.bend * 100;
            const rise = Math.min(dur * 0.4, 0.25);
            ev.pitchCurve = [[0, 0], [rise, cents]];
            if (tech.bendRelease) ev.pitchCurve.push([Math.max(rise, dur * 0.55), cents], [Math.max(rise + 0.05, dur * 0.9), 0]);
          }
          if (tech.vibrato) ev.vibrato = true;
          if (tech.slide === 'up' || tech.slide === 'down') slideOuts.push({ ev, dir: tech.slide });
          events.push(ev);
          lastOnString.set(note.string, { ev, note });

          // A slide into this note glides the previous note's pitch up to it.
          if (prev && prev.note.techniques.slide === 'legato' && legatoFromPrev && prev.ev.timbre === 'pluck') {
            const glide = Math.min(prev.ev.duration * 0.5, 0.15);
            const cents = (midi - prev.ev.midi) * 100;
            prev.ev.pitchCurve = [[Math.max(0, prev.ev.duration - glide), 0], [prev.ev.duration, cents]];
          }
        }
      });
    }
  }

  // Slides out of a note bend its pitch at the very end, once durations are final.
  for (const { ev, dir } of slideOuts) {
    const glide = Math.min(ev.duration * 0.4, 0.2);
    ev.pitchCurve = [[Math.max(0, ev.duration - glide), 0], [ev.duration, dir === 'up' ? 500 : -500]];
  }

  events.sort((a, b) => a.time - b.time);
  beats.sort((a, b) => a.time - b.time);
  return { events, beats, clicks, duration: total };
}

/** Index of the beat playing at `time` (binary search), or -1 before the first beat. */
export function beatAt(beats: BeatTime[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].time <= time + 1e-9) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
