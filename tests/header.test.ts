import { describe, expect, it } from 'vitest';
import { createSong } from '../src/model/factory';
import { createDemoSong } from '../src/model/demo';
import * as ops from '../src/model/operations';
import { creditLines, headerOps, watermarkOp } from '../src/layout/header';
import { layoutTrack } from '../src/layout/layout';
import { drawSystem } from '../src/layout/draw';
import { opBounds, type Op } from '../src/layout/ops';
import { paginate } from '../src/pdf/paginate';
import { pagesToPdf } from '../src/pdf/pdfWriter';
import { parseProject, serializeProject } from '../src/io/json';
import { DEFAULT_PREFS, normalizePrefs } from '../src/ui/editor/panelPrefs';

const texts = (list: Op[]) => list.flatMap((o) => (o.t === 'text' ? [o.text] : []));

describe('song credits', () => {
  it('builds credit lines and merges identical music and words credits', () => {
    const song = ops.setMeta(createSong(), { composer: 'Linh Tran', lyricist: 'Linh Tran', arranger: 'Bao Ngo', tabbedBy: 'Me' });
    expect(creditLines(song)).toEqual(['Words and music by Linh Tran', 'Arranged by Bao Ngo', 'Tab by Me']);
    expect(creditLines(ops.setMeta(song, { lyricist: 'An Pham' }))).toEqual(['Music by Linh Tran', 'Words by An Pham', 'Arranged by Bao Ngo', 'Tab by Me']);
  });

  it('draws title, subtitle, artist and credits without overlapping', () => {
    const song = ops.setMeta(createSong('Mua Ha'), { subtitle: 'Acoustic', artist: 'Band', album: 'Live', composer: 'A Composer With A Long Name', tabbedBy: 'Me' });
    const { ops: h, height } = headerOps(song, 0, 0, 515);
    expect(texts(h)).toEqual(expect.arrayContaining(['Mua Ha', 'Acoustic', 'Band, Live', 'Music by A Composer With A Long Name', 'Tab by Me']));
    for (const op of h) expect(opBounds(op).y + opBounds(op).h).toBeLessThanOrEqual(height);
    const boxes = h.map(opBounds);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it('prints credits, copyright and a watermark on every page', () => {
    let song = ops.setMeta(createDemoSong(), { copyright: '2026 Example Music', watermark: 'DRAFT' });
    for (let i = 0; i < 80; i++) song = ops.insertMeasure(song, song.masterBars.length);
    for (let m = 4; m < 84; m++) song = ops.setNote(song, { track: 0, measure: m, beat: 0, string: 1 }, 3);
    const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p, i) => {
      expect(p.ops[0]).toMatchObject({ t: 'text', text: 'DRAFT', c: 'faint' });
      expect(texts(p.ops).includes('2026 Example Music')).toBe(i === 0);
    });
    const b = opBounds(pages[0].ops[0]);
    // Centred on the page.
    expect(b.x + b.w / 2).toBeCloseTo(pages[0].width / 2, -1);
    expect(b.y + b.h / 2).toBeCloseTo(pages[0].height / 2, -1);
    const raw = pagesToPdf(pages, song, { compress: false }).output();
    expect(raw).toContain('(DRAFT) Tj');
    expect(raw).toContain('(2026 Example Music) Tj');
  });

  it('has no watermark when the field is empty', () => {
    expect(watermarkOp('  ', 500, 800)).toBeNull();
    expect(paginate(createSong(), { orientation: 'portrait', tracks: [0] })[0].ops.some((o) => o.c === 'faint')).toBe(false);
  });
});

describe('blank tabs and rests', () => {
  it('draws no rest symbols for empty beats, but does for written rests', () => {
    const song = createSong('Blank', 2);
    const layout = layoutTrack(song, 0, { width: 600, gap: 12 });
    const blank = drawSystem(song, layout, layout.systems[0]);
    expect(blank.some((o) => o.t === 'path')).toBe(false);
    const withRest = ops.setRest(song, 0, 0, 0, true);
    const l2 = layoutTrack(withRest, 0, { width: 600, gap: 12 });
    expect(drawSystem(withRest, l2, l2.systems[0]).some((o) => o.t === 'path')).toBe(true);
  });

  it('gives blank measures an even, readable width', () => {
    const layout = layoutTrack(createSong('Blank', 8), 0, { width: 2000, gap: 12 });
    const widths = layout.systems[0].measures.map((m) => m.w);
    expect(Math.min(...widths.slice(1))).toBeGreaterThan(100);
  });

  it('round-trips rests and the new song info fields through JSON', () => {
    let song = ops.setRest(createSong(), 0, 0, 0, true);
    song = ops.setMeta(song, { subtitle: 's', composer: 'c', lyricist: 'l', arranger: 'a', copyright: 'cr', watermark: 'w' });
    const r = parseProject(serializeProject(song));
    expect(r.ok && r.song.tracks[0].measures[0].beats[0].rest).toBe(true);
    expect(r.ok && r.song.meta).toEqual(song.meta);
  });
});

describe('panel preferences', () => {
  it('drops unknown groups, keeps the user order and adds new groups', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    const p = normalizePrefs({ left: false, order: ['bend', 'nope', 'frets', 'bend'], hidden: ['beat', 'x'], collapsed: ['i-note', 3] });
    expect(p.left).toBe(false);
    expect(p.right).toBe(true);
    // The user's relative order survives; groups they never saw are inserted at their default spot.
    expect(p.order.indexOf('bend')).toBeLessThan(p.order.indexOf('frets'));
    expect(new Set(p.order).size).toBe(p.order.length);
    expect(p.order).toHaveLength(DEFAULT_PREFS.order.length);
    expect(p.hidden).toEqual(['beat']);
    expect(p.collapsed).toEqual(['i-note']);
  });
});
