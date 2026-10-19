/**
 * Page layout for print: places systems on A4 pages with a title block, running headers and page
 * numbers. Systems are never split across pages. Output is the same display list the editor draws,
 * so the print preview and the PDF are rendered from identical data.
 */
import type { Song } from '../model/types';
import { effectiveTimeSignatures } from '../model/duration';
import { pitchClass } from '../model/tuning';
import { drawSystem, beatSequence } from '../layout/draw';
import { layoutTrack } from '../layout/layout';
import type { Op } from '../layout/ops';
import { translateOps } from '../layout/ops';

export type Orientation = 'portrait' | 'landscape';

export const A4 = { width: 595.28, height: 841.89 };

export interface PrintOptions {
  orientation: Orientation;
  /** Track indices to include, in order. Each track after the first starts on a new page. */
  tracks: number[];
  /** Page margin in points (default 42pt ≈ 15mm). */
  margin?: number;
  /** String spacing in points (default 10.5). */
  gap?: number;
}

export interface Page {
  number: number;
  width: number;
  height: number;
  ops: Op[];
}

export function tuningLabel(tuning: string[]): string {
  return [...tuning].reverse().map(pitchClass).join(' ');
}

export function pageSize(orientation: Orientation) {
  return orientation === 'portrait' ? { ...A4 } : { width: A4.height, height: A4.width };
}

export function paginate(song: Song, opts: PrintOptions): Page[] {
  const { width, height } = pageSize(opts.orientation);
  const margin = opts.margin ?? 42;
  const gap = opts.gap ?? 10.5;
  const contentW = width - margin * 2;
  const bottom = height - margin;
  const tracks = opts.tracks.filter((t) => t >= 0 && t < song.tracks.length);
  if (tracks.length === 0) tracks.push(0);

  const pages: Op[][] = [];
  let ops: Op[] = [];
  let y = margin;
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = margin + runningHeader(ops, song, width, margin);
  };

  // Title block on page 1.
  y = margin + titleBlock(ops, song, width, margin);

  tracks.forEach((ti, n) => {
    if (n > 0) newPage();
    y += trackHeading(ops, song, ti, margin, y, contentW, tracks.length > 1);

    const layout = layoutTrack(song, ti, { width: contentW, gap, showTempo: true });
    const seq = beatSequence(song, layout);
    for (const sys of layout.systems) {
      if (y + sys.height > bottom && ops.length > 0 && y > margin + 40) newPage();
      ops.push(...translateOps(drawSystem(song, layout, sys, seq), margin, y));
      y += sys.height + layout.systemGap;
    }
  });
  pages.push(ops);

  const total = pages.length;
  return pages.map((pageOps, i) => {
    pageOps.push({ t: 'text', x: width / 2, y: height - margin / 2, text: `Page ${i + 1} of ${total}`, size: 8, font: 'sans', anchor: 'middle', c: 'muted' });
    return { number: i + 1, width, height, ops: pageOps };
  });
}

function titleBlock(ops: Op[], song: Song, width: number, margin: number): number {
  const { title, artist, album, tabbedBy } = song.meta;
  let h = 20;
  ops.push({ t: 'text', x: width / 2, y: margin + h, text: title || 'Untitled', size: 20, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
  const sub = [artist, album].filter(Boolean).join(' — ');
  if (sub) {
    h += 17;
    ops.push({ t: 'text', x: width / 2, y: margin + h, text: sub, size: 11, font: 'sans', anchor: 'middle', c: 'ink' });
  }
  if (tabbedBy) {
    h += 13;
    ops.push({ t: 'text', x: width / 2, y: margin + h, text: `Tab by ${tabbedBy}`, size: 8.5, font: 'sans', italic: true, anchor: 'middle', c: 'muted' });
  }
  return h + 14;
}

function runningHeader(ops: Op[], song: Song, width: number, margin: number): number {
  const label = [song.meta.title || 'Untitled', song.meta.artist].filter(Boolean).join(' — ');
  ops.push({ t: 'text', x: margin, y: margin - 14, text: label, size: 8, font: 'sans', anchor: 'start', c: 'muted' });
  ops.push({ t: 'line', x1: margin, y1: margin - 9, x2: width - margin, y2: margin - 9, w: 0.4, c: 'staff' });
  return 6;
}

/** Track info line: tuning, capo, tempo and time signature (plus the track name when printing several). */
function trackHeading(ops: Op[], song: Song, ti: number, margin: number, y: number, contentW: number, showName: boolean): number {
  const t = song.tracks[ti];
  let h = 0;
  if (showName) {
    h += 12;
    ops.push({ t: 'text', x: margin, y: y + h, text: t.name, size: 11, font: 'sans', bold: true, anchor: 'start', c: 'ink' });
  }
  h += 12;
  const ts = effectiveTimeSignatures(song)[0] ?? song.timeSignature;
  const strings = t.instrument.tuning.length;
  const left = `Tuning: ${tuningLabel(t.instrument.tuning)}${strings !== 6 ? ` (${strings}-string)` : ''}   ·   ${t.instrument.capo ? `Capo ${t.instrument.capo}` : 'No capo'}`;
  const right = `${song.tempo} BPM   ·   ${ts.numerator}/${ts.denominator}`;
  ops.push({ t: 'text', x: margin, y: y + h, text: left, size: 8.5, font: 'sans', anchor: 'start', c: 'ink' });
  ops.push({ t: 'text', x: margin + contentW, y: y + h, text: right, size: 8.5, font: 'sans', anchor: 'end', c: 'ink' });
  return h + 10;
}
