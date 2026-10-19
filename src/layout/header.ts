/**
 * Score header and watermark, drawn identically on the editor sheet, the print preview and the PDF:
 * title, subtitle and artist centred; credits (music, words, arrangement, tab) on the right.
 */
import type { Song } from '../model/types';
import type { Op } from './ops';
import { textWidth } from './ops';

export function creditLines(song: Song): string[] {
  const { composer, lyricist, arranger, tabbedBy } = song.meta;
  const lines: string[] = [];
  if (composer && composer === lyricist) lines.push(`Words and music by ${composer}`);
  else {
    if (composer) lines.push(`Music by ${composer}`);
    if (lyricist) lines.push(`Words by ${lyricist}`);
  }
  if (arranger) lines.push(`Arranged by ${arranger}`);
  if (tabbedBy) lines.push(`Tab by ${tabbedBy}`);
  return lines;
}

/** Header ops starting at (x0, y0) across `width`; returns the height used. */
export function headerOps(song: Song, x0: number, y0: number, width: number): { ops: Op[]; height: number } {
  const ops: Op[] = [];
  const { title, subtitle, artist, album } = song.meta;
  const cx = x0 + width / 2;
  let y = y0 + 20;
  ops.push({ t: 'text', x: cx, y, text: title || 'Untitled', size: 20, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
  if (subtitle) {
    y += 16;
    ops.push({ t: 'text', x: cx, y, text: subtitle, size: 11.5, font: 'sans', anchor: 'middle', c: 'ink' });
  }
  const byline = [artist, album].filter(Boolean).join(', ');
  if (byline) {
    y += 15;
    ops.push({ t: 'text', x: cx, y, text: byline, size: 10.5, font: 'sans', italic: true, anchor: 'middle', c: 'muted' });
  }
  // Credits sit on the right, below the title so they never collide with it.
  let cy = y0 + 34;
  for (const line of creditLines(song)) {
    ops.push({ t: 'text', x: x0 + width, y: cy, text: line, size: 8.5, font: 'sans', anchor: 'end', c: 'ink' });
    cy += 11;
  }
  return { ops, height: Math.max(y, cy - 11) - y0 + 12 };
}

/** Large faint diagonal text centred on a page. Drawn first so notation prints over it. */
export function watermarkOp(text: string, width: number, height: number): Op | null {
  const label = text.trim();
  if (!label) return null;
  const angle = (Math.atan2(height, width) * 180) / Math.PI;
  const diagonal = Math.hypot(width, height);
  const size = Math.max(18, Math.min(96, (diagonal * 0.7) / Math.max(1, textWidth(label, 1, 'sans', true))));
  const w = textWidth(label, size, 'sans', true);
  const a = (angle * Math.PI) / 180;
  // Rotated text is drawn from its start point (PDF ignores alignment when rotating), so place the
  // start so that the text's centre lands on the page centre.
  const x = width / 2 - (w / 2) * Math.cos(a) + size * 0.35 * Math.sin(a);
  const y = height / 2 + (w / 2) * Math.sin(a) + size * 0.35 * Math.cos(a);
  return { t: 'text', x, y, text: label, size, font: 'sans', bold: true, anchor: 'start', c: 'faint', angle };
}
