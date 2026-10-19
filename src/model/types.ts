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
/** Natural, artificial (A.H.), pinch (P.H.) or tapped (T.H.) harmonic. */
export type HarmonicType = 'natural' | 'artificial' | 'pinch' | 'tapped';
export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';
export const DYNAMICS: readonly Dynamic[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
/** Strum direction for the whole beat: down = low to high strings, up = high to low. */
export type Stroke = 'down' | 'up';

/** Guitar techniques applied to a single note. All optional; absent means off. */
export interface NoteTechniques {
  /** Hammer-on or pull-off to the next note on the same string (decided by fret direction). */
  legato?: boolean;
  slide?: SlideType;
  /** Bend amount in semitones (1 = half step, 2 = full). */
  bend?: number;
  /** Return to pitch after the bend. */
  bendRelease?: boolean;
  /** The string is bent before it is picked (the note starts at the bent pitch). */
  prebend?: boolean;
  vibrato?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  harmonic?: HarmonicType;
  tapped?: boolean;
  ghost?: boolean;
  /** Tied to the previous note on the same string (no re-attack). */
  tie?: boolean;
  /** Muted / dead note, written as "x" (also used for percussive slaps on the strings). */
  dead?: boolean;
  /** Bass-style slap (S) and pop (P). */
  slap?: boolean;
  pop?: boolean;
  accent?: 'normal' | 'heavy';
  staccato?: boolean;
  /** Fret of a grace note played just before this note. */
  grace?: number;
  /** Fret alternated with this note in a trill. */
  trill?: number;
  /** Tremolo picking: the note is re-picked rapidly for its whole duration. */
  tremolo?: boolean;
  /** Volume swell into the note. */
  fadeIn?: boolean;
}

export interface Note {
  /** String index, 0 = highest-pitched string. */
  string: number;
  fret: number;
  techniques: NoteTechniques;
}

/**
 * A rhythmic slot in a measure. A beat with no notes is silent; it shows a rest symbol only when
 * `rest` is set, so a blank tab looks like blank staff paper rather than a page of rests.
 */
export interface Beat {
  id: string;
  duration: Duration;
  notes: Note[];
  /** Written rest (set explicitly by the user). */
  rest?: boolean;
  /** Chord name shown above the staff from this beat, e.g. "Am7". */
  chord?: string;
  /** Free text above the staff, e.g. a section name ("Intro", "Chorus"). */
  text?: string;
  stroke?: Stroke;
  /** Dynamic marking; applies from this beat until the next marking. */
  dynamic?: Dynamic;
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
  subtitle: string;
  artist: string;
  album: string;
  /** Music by. */
  composer: string;
  /** Words by. */
  lyricist: string;
  arranger: string;
  tabbedBy: string;
  copyright: string;
  /** Optional text printed faintly across every PDF page. Empty = no watermark. */
  watermark: string;
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
