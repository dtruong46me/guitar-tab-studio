/**
 * Tablature layout: turns one track of a Song into systems (staff rows) with exact measure and
 * beat positions. Pure geometry, no drawing; all sizes derive from the string gap, so zooming
 * or changing page size never moves notes relative to each other.
 */
import type { Beat, Position, Song, TimeSignature } from '../model/types';
import { durationTicks, effectiveTimeSignatures, measureCapacity, sameTimeSignature } from '../model/duration';
import { textWidth } from './ops';

export interface LayoutOptions {
  /** Content width available for systems, in points. */
  width: number;
  /** Distance between string lines, in points. Everything else scales from it. */
  gap: number;
  /** Draw the tempo mark above the first system. */
  showTempo?: boolean;
}

export interface Metrics {
  u: number;
  gap: number;
  fretSize: number;
  smallSize: number;
  namesW: number;
  clefW: number;
  headerW: number;
  timeSigW: number;
  padL: number;
  padR: number;
  rowH: number;
  stemLen: number;
}

export function metricsFor(gap: number): Metrics {
  const u = gap / 12;
  const namesW = 11 * u;
  const clefW = 17 * u;
  return {
    u,
    gap,
    fretSize: gap * 0.85,
    smallSize: 7.5 * u,
    namesW,
    clefW,
    headerW: namesW + clefW,
    timeSigW: 16 * u,
    padL: 7 * u,
    padR: 5 * u,
    rowH: 10 * u,
    stemLen: 15 * u,
  };
}

export interface BeatLayout {
  beat: number;
  /** x of the note column (fret numbers are centred here). */
  x: number;
  slotX: number;
  slotW: number;
  tickStart: number;
}

export interface MeasureLayout {
  measure: number;
  x: number;
  w: number;
  timeSignature: TimeSignature;
  showTimeSignature: boolean;
  beats: BeatLayout[];
  overfull: boolean;
  underfull: boolean;
}

export interface SystemRows {
  tempoY?: number;
  /** Section text such as "Intro" or "Chorus". */
  textY?: number;
  chordY?: number;
  measureNumberY: number;
  palmMuteY?: number;
  letRingY?: number;
  vibratoY?: number;
  lettersY: number;
  /** Dynamics (p, mf, f...) below the rhythm stems. */
  dynamicY?: number;
}

export interface SystemLayout {
  index: number;
  /** Top of the system relative to the top of the track layout. */
  y: number;
  height: number;
  staffTop: number;
  staffBottom: number;
  rhythmTop: number;
  rows: SystemRows;
  measures: MeasureLayout[];
}

export interface TrackLayout {
  track: number;
  width: number;
  metrics: Metrics;
  strings: number;
  systems: SystemLayout[];
  height: number;
  systemGap: number;
}

const BASE_WIDTH: Record<number, number> = { 1: 58, 2: 42, 4: 30, 8: 23, 16: 19 };
const BLANK_MEASURE_WIDTH = 110;

export function noteLabel(fret: number, t: { dead?: boolean; ghost?: boolean; tie?: boolean; harmonic?: string; trill?: number }): string {
  if (t.dead) return 'x';
  let label = String(fret);
  if (t.harmonic === 'natural') label = `<${fret}>`;
  else if (t.ghost || t.tie) label = `(${fret})`;
  // A trill shows the alternate fret in parentheses after the main one, e.g. 5(7).
  if (t.trill !== undefined) label += `(${t.trill})`;
  return label;
}

/** Space reserved left of the note column for grace notes and strum arrows. */
export function beatLead(beat: Beat, m: Metrics): number {
  return (beat.notes.some((n) => n.techniques.grace !== undefined) ? 10 * m.u : 0) + (beat.stroke && beat.notes.length ? 6 * m.u : 0);
}

export const chordSize = (m: Metrics) => 9 * m.u;

function beatMinWidth(beat: Beat, m: Metrics): number {
  const base = BASE_WIDTH[beat.duration.value] * (beat.duration.dotted ? 1.2 : 1) * m.u;
  let label = 0;
  for (const n of beat.notes) label = Math.max(label, textWidth(noteLabel(n.fret, n.techniques), m.fretSize, 'mono'));
  // Room for a slide or bend drawn to the right of the note.
  const extra = beat.notes.some((n) => n.techniques.slide || n.techniques.bend) ? 8 * m.u : 0;
  // A chord name must not run into the next one.
  const chord = beat.chord ? textWidth(beat.chord, chordSize(m), 'sans', true) + 5 * m.u : 0;
  return Math.max(base, label + 9 * m.u + extra, chord) + beatLead(beat, m);
}

function hasTechnique(song: Song, track: number, measures: number[], key: 'palmMute' | 'letRing' | 'vibrato'): boolean {
  return measures.some((mi) => song.tracks[track].measures[mi].beats.some((b) => b.notes.some((n) => n.techniques[key])));
}

function hasBeatProp(song: Song, track: number, measures: number[], key: 'chord' | 'text' | 'dynamic'): boolean {
  return measures.some((mi) => song.tracks[track].measures[mi].beats.some((b) => b[key]));
}

export function layoutTrack(song: Song, track: number, opts: LayoutOptions): TrackLayout {
  const m = metricsFor(opts.gap);
  const t = song.tracks[track];
  const strings = t.instrument.tuning.length;
  const sigs = effectiveTimeSignatures(song);
  const available = Math.max(opts.width - m.headerW, 60 * m.u);

  // 1. Natural widths of each measure.
  const natural = t.measures.map((measure, mi) => {
    const showTs = mi === 0 || !sameTimeSignature(sigs[mi], sigs[mi - 1]);
    const beatWidths = measure.beats.map((b) => beatMinWidth(b, m));
    // A measure with nothing written yet gets the width of a comfortably filled one, so a blank tab
    // reads as evenly ruled staff paper instead of narrow slivers.
    const blank = measure.beats.every((b) => b.notes.length === 0 && !b.rest);
    if (blank) {
      const sum = beatWidths.reduce((a, b) => a + b, 0);
      const target = BLANK_MEASURE_WIDTH * m.u;
      if (sum < target) beatWidths.forEach((w, i) => (beatWidths[i] = (w / sum) * target));
    }
    const fixed = m.padL + m.padR + (showTs ? m.timeSigW : 0);
    return { showTs, beatWidths, fixed, total: fixed + beatWidths.reduce((a, b) => a + b, 0) };
  });

  // 2. Greedy line breaking.
  const lines: number[][] = [];
  let line: number[] = [];
  let lineW = 0;
  natural.forEach((nm, mi) => {
    if (line.length > 0 && lineW + nm.total > available) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
    line.push(mi);
    lineW += nm.total;
  });
  if (line.length) lines.push(line);

  // 3. Justify each line and position beats; then stack systems vertically.
  const systems: SystemLayout[] = [];
  let y = 0;
  const systemGap = 14 * m.u;
  lines.forEach((mis, li) => {
    const fixed = mis.reduce((a, mi) => a + natural[mi].fixed, 0);
    const flexible = mis.reduce((a, mi) => a + natural[mi].total - natural[mi].fixed, 0);
    const total = fixed + flexible;
    const isLast = li === lines.length - 1;
    let scale = 1;
    if (total > available) scale = Math.max(0.1, (available - fixed) / flexible);
    else if (!isLast || total > available * 0.65) scale = (available - fixed) / flexible;

    let x = m.headerW;
    const measures: MeasureLayout[] = mis.map((mi) => {
      const nm = natural[mi];
      const measure = t.measures[mi];
      let bx = x + m.padL + (nm.showTs ? m.timeSigW : 0);
      let tick = 0;
      const beats = measure.beats.map((b, bi) => {
        const slotW = nm.beatWidths[bi] * scale;
        const lead = beatLead(b, m);
        const bl: BeatLayout = { beat: bi, slotX: bx, slotW, x: bx + lead + Math.min((slotW - lead) / 2, 9 * m.u), tickStart: tick };
        bx += slotW;
        tick += durationTicks(b.duration);
        return bl;
      });
      const w = bx + m.padR - x;
      const cap = measureCapacity(sigs[mi]);
      const ml: MeasureLayout = {
        measure: mi,
        x,
        w,
        timeSignature: sigs[mi],
        showTimeSignature: nm.showTs,
        beats,
        overfull: tick > cap,
        underfull: tick < cap,
      };
      x += w;
      return ml;
    });

    // Vertical rows, top to bottom; optional rows only when this system uses them.
    const rows: SystemRows = { measureNumberY: 0, lettersY: 0 };
    let ry = 3 * m.u;
    if (li === 0 && opts.showTempo) {
      rows.tempoY = ry + 9 * m.u;
      ry += 14 * m.u;
    }
    if (hasBeatProp(song, track, mis, 'text')) {
      rows.textY = ry + 9 * m.u;
      ry += 13 * m.u;
    }
    if (hasBeatProp(song, track, mis, 'chord')) {
      rows.chordY = ry + 9 * m.u;
      ry += 13 * m.u;
    }
    rows.measureNumberY = ry + 7 * m.u;
    ry += m.rowH;
    if (hasTechnique(song, track, mis, 'palmMute')) {
      rows.palmMuteY = ry + 7.5 * m.u;
      ry += m.rowH;
    }
    if (hasTechnique(song, track, mis, 'letRing')) {
      rows.letRingY = ry + 7.5 * m.u;
      ry += m.rowH;
    }
    if (hasTechnique(song, track, mis, 'vibrato')) {
      rows.vibratoY = ry + 5 * m.u;
      ry += 9 * m.u;
    }
    rows.lettersY = ry + 8 * m.u;
    ry += 14 * m.u;
    const staffTop = ry + 2 * m.u;
    const staffBottom = staffTop + (strings - 1) * m.gap;
    const rhythmTop = staffBottom + 7 * m.u;
    let height = rhythmTop + m.stemLen + 4 * m.u;
    if (hasBeatProp(song, track, mis, 'dynamic')) {
      rows.dynamicY = height + 8 * m.u;
      height += 12 * m.u;
    }
    systems.push({ index: li, y, height, staffTop, staffBottom, rhythmTop, rows, measures });
    y += height + systemGap;
  });

  return { track, width: opts.width, metrics: m, strings, systems, height: Math.max(0, y - systemGap), systemGap };
}

/** Locate the system and measure layout that contain a measure index. */
export function findMeasure(layout: TrackLayout, measure: number): { system: SystemLayout; measure: MeasureLayout } | undefined {
  for (const system of layout.systems) {
    const ml = system.measures.find((x) => x.measure === measure);
    if (ml) return { system, measure: ml };
  }
  return undefined;
}

export function stringY(system: SystemLayout, gap: number, string: number): number {
  return system.staffTop + string * gap;
}

/** Map a point in layout coordinates to the nearest measure / beat / string. */
export function hitTest(layout: TrackLayout, x: number, y: number): Omit<Position, 'track'> | null {
  if (layout.systems.length === 0) return null;
  let system = layout.systems[layout.systems.length - 1];
  for (const sys of layout.systems) {
    if (y < sys.y + sys.height + layout.systemGap / 2) {
      system = sys;
      break;
    }
  }
  const measures = system.measures;
  let ml = measures[measures.length - 1];
  for (const cand of measures) {
    if (x < cand.x + cand.w) {
      ml = cand;
      break;
    }
  }
  let beat = ml.beats[0];
  for (const b of ml.beats) if (x >= b.slotX) beat = b;
  const localY = y - system.y - system.staffTop;
  const string = Math.min(layout.strings - 1, Math.max(0, Math.round(localY / layout.metrics.gap)));
  return { measure: ml.measure, beat: beat.beat, string };
}
