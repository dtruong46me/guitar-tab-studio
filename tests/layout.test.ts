import { describe, expect, it } from 'vitest';
import { createSong } from '../src/model/factory';
import { createDemoSong } from '../src/model/demo';
import { denseSong } from './fixtures';
import * as ops from '../src/model/operations';
import { hitTest, layoutTrack, type TrackLayout } from '../src/layout/layout';
import { beatSequence, drawSystem } from '../src/layout/draw';
import { opBounds, type Op } from '../src/layout/ops';
import type { Song } from '../src/model/types';

function fretBoxes(song: Song, layout: TrackLayout) {
  const seq = beatSequence(song, layout);
  return layout.systems.map((sys) => drawSystem(song, layout, sys, seq).filter((o): o is Extract<Op, { t: 'text' }> => o.t === 'text' && o.font === 'mono' && o.size === layout.metrics.fretSize));
}

describe('layout', () => {
  it('wraps measures into systems that fit the width', () => {
    const song = denseSong(12);
    const layout = layoutTrack(song, 0, { width: 500, gap: 10 });
    expect(layout.systems.length).toBeGreaterThan(1);
    for (const sys of layout.systems) {
      const last = sys.measures[sys.measures.length - 1];
      expect(last.x + last.w).toBeLessThanOrEqual(500 + 0.01);
      // Measures are contiguous and in order.
      sys.measures.forEach((m, i) => i > 0 && expect(m.x).toBeCloseTo(sys.measures[i - 1].x + sys.measures[i - 1].w, 6));
    }
    expect(layout.systems.flatMap((s) => s.measures.map((m) => m.measure))).toEqual([...Array(12).keys()]);
  });

  it('never overlaps fret numbers on a string, even in dense measures', () => {
    const song = denseSong(8);
    const layout = layoutTrack(song, 0, { width: 515, gap: 10.5 });
    for (const texts of fretBoxes(song, layout)) {
      const byLine = new Map<number, ReturnType<typeof opBounds>[]>();
      for (const t of texts) byLine.set(t.y, [...(byLine.get(t.y) ?? []), opBounds(t)]);
      for (const boxes of byLine.values()) {
        boxes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].w);
      }
    }
  });

  it('stacks systems without vertical overlap', () => {
    const layout = layoutTrack(createDemoSong(), 0, { width: 400, gap: 12, showTempo: true });
    for (let i = 1; i < layout.systems.length; i++) {
      const prev = layout.systems[i - 1];
      expect(layout.systems[i].y).toBeGreaterThanOrEqual(prev.y + prev.height);
    }
  });

  it('shows time signatures on the first measure and on changes only', () => {
    let song = createSong('x', 4);
    song = ops.setMeasureTimeSignature(song, 2, { numerator: 3, denominator: 4 });
    const layout = layoutTrack(song, 0, { width: 2000, gap: 12 });
    expect(layout.systems[0].measures.map((m) => m.showTimeSignature)).toEqual([true, false, true, false]);
  });

  it('flags overfull measures', () => {
    let song = createSong('x', 1);
    for (let i = 0; i < 4; i++) song = ops.insertBeat(song, 0, 0, 0);
    expect(layoutTrack(song, 0, { width: 600, gap: 12 }).systems[0].measures[0].overfull).toBe(true);
  });

  it('scales geometry with the string gap (zoom-independent proportions)', () => {
    const song = createDemoSong();
    const a = layoutTrack(song, 0, { width: 2000, gap: 10 });
    const b = layoutTrack(song, 0, { width: 4000, gap: 20 });
    const ma = a.systems[0].measures;
    const mb = b.systems[0].measures;
    expect(mb.length).toBe(ma.length);
    ma.forEach((m, i) => m.beats.forEach((bt, j) => expect(mb[i].beats[j].x).toBeCloseTo(bt.x * 2, 6)));
  });

  it('hit-tests points back to measure, beat and string', () => {
    const song = createDemoSong();
    const layout = layoutTrack(song, 0, { width: 700, gap: 12 });
    const sys = layout.systems[0];
    const target = sys.measures[1].beats[2];
    const hit = hitTest(layout, target.x, sys.y + sys.staffTop + 3 * 12 + 2);
    expect(hit).toEqual({ measure: sys.measures[1].measure, beat: 2, string: 3 });
  });

  it('handles an empty project', () => {
    const layout = layoutTrack(createSong('Empty', 1), 0, { width: 300, gap: 12 });
    expect(layout.systems).toHaveLength(1);
    expect(drawSystem(createSong('Empty', 1), layout, layout.systems[0]).length).toBeGreaterThan(0);
  });
});
