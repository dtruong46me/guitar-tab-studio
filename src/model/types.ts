/**
 * Music data model. Plain, serialisable data with no UI or rendering concerns.
 * Everything here round-trips through JSON (see io/json.ts).
 */

export const SCHEMA_VERSION = 1;

/** Note value denominators: 1 = whole, 2 = half, 4 = quarter, 8 = eighth, 16 = sixteenth. */
export type DurationValue = 1 | 2 | 4 | 8 | 16;
export const DURATION_VALUES: readonly DurationValue[] = [1, 2, 4, 8, 16];

export interface Duration {
  value: DurationValue;
  dotted: boolean;
}

export interface TimeSignature {
  numerator: number;
  denominator: 2 | 4 | 8 | 16;
}

export type SlideType = 'up' | 'down' | 'legato';
export type HarmonicType = 'natural' | 'artificial';

/** Guitar techniques applied to a single note. All optional; absent means off. */
export interface NoteTechniques {
  /** Hammer-on or pull-off to the next note on the same string (decided by fret direction). */
  legato?: boolean;
  slide?: SlideType;
  /** Bend amount in semitones (1 = half step, 2 = full). */
  bend?: number;
  /** Return to pitch after the bend. */
  bendRelease?: boolean;
  vibrato?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  harmonic?: HarmonicType;
  tapped?: boolean;
  ghost?: boolean;
  /** Tied to the previous note on the same string (no re-attack). */
  tie?: boolean;
  /** Muted / dead note, written as "x". */
  dead?: boolean;
}

export interface Note {
  /** String index, 0 = highest-pitched string. */
  string: number;
  fret: number;
  techniques: NoteTechniques;
}

/** A rhythmic slot in a measure. A beat with no notes is a rest. */
export interface Beat {
  id: string;
  duration: Duration;
  notes: Note[];
}

export interface Measure {
  id: string;
  beats: Beat[];
}

/** Per-measure data shared by every track (time signature and tempo changes). */
export interface MasterBar {
  /** Time signature change starting at this measure. Absent = inherited. */
  timeSignature?: TimeSignature;
  /** Tempo change (BPM) starting at this measure. Absent = inherited. */
  tempo?: number;
}

export interface Instrument {
  /** Scientific pitch names from highest to lowest string, e.g. ["E4","B3","G3","D3","A2","E2"]. */
  tuning: string[];
  capo: number;
}

export interface Track {
  id: string;
  name: string;
  instrument: Instrument;
  /** Always the same length as Song.masterBars. */
  measures: Measure[];
}

export interface SongMeta {
  title: string;
  artist: string;
  album: string;
  tabbedBy: string;
}

export interface Song {
  schemaVersion: number;
  id: string;
  meta: SongMeta;
  tempo: number;
  timeSignature: TimeSignature;
  keySignature: string;
  masterBars: MasterBar[];
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

/** A position in the score addressed by the editor. */
export interface Position {
  track: number;
  measure: number;
  beat: number;
  string: number;
}
