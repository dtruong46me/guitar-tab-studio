import { describe, expect, it } from 'vitest';
import { createDemoSong } from '../src/model/demo';
import { createSong } from '../src/model/factory';
import * as ops from '../src/model/operations';
import { paginate, pageSize } from '../src/pdf/paginate';
import { exportPdf, pagesToPdf, pdfFileName } from '../src/pdf/pdfWriter';
import { opBounds } from '../src/layout/ops';
import { denseSong } from './fixtures';

const MARGIN = 42;

describe('pagination', () => {
  it('lays out A4 portrait and landscape pages', () => {
    const song = createDemoSong();
    const portrait = paginate(song, { orientation: 'portrait', tracks: [0] });
    const landscape = paginate(song, { orientation: 'landscape', tracks: [0] });
    expect(portrait[0]).toMatchObject({ width: 595.28, height: 841.89 });
    expect(landscape[0]).toMatchObject({ width: 841.89, height: 595.28 });
  });

  it('includes title, artist, tuning, capo, tempo, time signature and page numbers', () => {
    let song = ops.setCapo(createDemoSong(), 0, 3);
    song = ops.setMeta(song, { artist: 'The Band' });
    const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
    const texts = pages[0].ops.filter((o) => o.t === 'text').map((o) => (o as { text: string }).text);
    expect(texts).toContain('Technique Showcase');
    expect(texts).toContain('The Band');
    expect(texts.some((t) => t.includes('Tuning: E A D G B E') && t.includes('Capo 3'))).toBe(true);
    expect(texts.some((t) => t.includes('120 BPM') && t.includes('4/4'))).toBe(true);
    expect(texts).toContain('Page 1 of 1');
    expect(texts).toContain('1'); // measure number
  });

  it('breaks long compositions across pages without clipping notation', () => {
    const song = denseSong(120);
    for (const orientation of ['portrait', 'landscape'] as const) {
      const pages = paginate(song, { orientation, tracks: [0] });
      expect(pages.length).toBeGreaterThan(2);
      const { width, height } = pageSize(orientation);
      pages.forEach((page, i) => {
        expect(page.ops.some((o) => o.t === 'text' && o.text === `Page ${i + 1} of ${pages.length}`)).toBe(true);
        for (const op of page.ops) {
          const b = opBounds(op);
          const isChrome = op.t === 'text' && (op.text.startsWith('Page ') || op.y < MARGIN);
          const isHeaderRule = op.t === 'line' && op.y1 < MARGIN;
          if (isChrome || isHeaderRule) {
            expect(b.y).toBeGreaterThanOrEqual(0);
            expect(b.y + b.h).toBeLessThanOrEqual(height);
            continue;
          }
          // Notation stays inside the margins on every page.
          expect(b.x).toBeGreaterThanOrEqual(MARGIN - 0.5);
          expect(b.x + b.w).toBeLessThanOrEqual(width - MARGIN + 0.5);
          expect(b.y).toBeGreaterThanOrEqual(MARGIN - 1);
          expect(b.y + b.h).toBeLessThanOrEqual(height - MARGIN + 0.5);
        }
      });
    }
  });

  it('prints every measure exactly once', () => {
    const song = denseSong(60);
    const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
    const numbers = pages.flatMap((p) => p.ops.filter((o) => o.t === 'text' && o.font === 'mono' && o.c === 'muted' && /^\d+$/.test(o.text)).map((o) => Number((o as { text: string }).text)));
    expect(numbers).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it('starts each additional track on a new page', () => {
    const song = ops.addTrack(createDemoSong(), 'Rhythm');
    const one = paginate(song, { orientation: 'portrait', tracks: [0] });
    const both = paginate(song, { orientation: 'portrait', tracks: [0, 1] });
    expect(both.length).toBe(one.length + 1);
    expect(both[both.length - 1].ops.some((o) => o.t === 'text' && o.text === 'Rhythm')).toBe(true);
  });

  it('handles an empty project', () => {
    const pages = paginate(createSong('', 1), { orientation: 'portrait', tracks: [0] });
    expect(pages).toHaveLength(1);
    expect(pages[0].ops.some((o) => o.t === 'text' && o.text === 'Untitled')).toBe(true);
  });
});

describe('PDF writer', () => {
  it('writes a vector PDF with real text and one PDF page per preview page', () => {
    const song = denseSong(80);
    const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
    const doc = pagesToPdf(pages, song, { compress: false });
    expect(doc.getNumberOfPages()).toBe(pages.length);
    const raw = doc.output();
    expect(raw.startsWith('%PDF-')).toBe(true);
    // Notation is text and vector strokes, not an embedded image.
    expect(raw).toContain('(Dense) Tj');
    expect(raw).toMatch(/\(21\) Tj/);
    expect(raw).not.toContain('/Subtype /Image');
    expect(raw).toMatch(/ m\s+[\d.]+ [\d.]+ l\s+S/);
  });

  it('exports compressed output and a safe file name', () => {
    const song = ops.setMeta(createDemoSong(), { artist: 'AC/DC', title: 'T.N.T?' });
    const { doc, pages } = exportPdf(song, { orientation: 'landscape', tracks: [0] });
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(pdfFileName(song)).toBe('ACDC - T.N.T.pdf');
  });
});
