import type { Beat, Duration, Instrument, Measure, Song, Track } from './types';
import { SCHEMA_VERSION } from './types';
import { STANDARD_TUNING } from './tuning';

let counter = 0;

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBeat(duration: Duration = { value: 4, dotted: false }): Beat {
  return { id: newId(), duration: { ...duration }, notes: [] };
}

/** A new measure holds a single empty (rest) beat, so it can be navigated and edited. */
export function createMeasure(duration?: Duration): Measure {
  return { id: newId(), beats: [createBeat(duration)] };
}

export function createInstrument(tuning: string[] = STANDARD_TUNING, capo = 0): Instrument {
  return { tuning: [...tuning], capo };
}

export function createTrack(name: string, measureCount: number, instrument: Instrument = createInstrument()): Track {
  return {
    id: newId(),
    name,
    instrument,
    measures: Array.from({ length: measureCount }, () => createMeasure()),
  };
}

export function createSong(title = 'Untitled', measureCount = 4): Song {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    meta: { title, artist: '', album: '', tabbedBy: '' },
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: 'C',
    masterBars: Array.from({ length: measureCount }, () => ({})),
    tracks: [createTrack('Guitar', measureCount)],
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep copy with fresh ids, used for "Duplicate project" and paste. */
export function cloneSongWithNewIds(song: Song): Song {
  const copy: Song = JSON.parse(JSON.stringify(song));
  copy.id = newId();
  for (const t of copy.tracks) {
    t.id = newId();
    for (const m of t.measures) {
      m.id = newId();
      for (const b of m.beats) b.id = newId();
    }
  }
  const now = new Date().toISOString();
  copy.createdAt = now;
  copy.updatedAt = now;
  return copy;
}

export function cloneBeat(beat: Beat): Beat {
  return { id: newId(), duration: { ...beat.duration }, notes: beat.notes.map((n) => ({ ...n, techniques: { ...n.techniques } })) };
}
