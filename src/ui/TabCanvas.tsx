/** The editable tablature sheet: draws the shared notation ops plus cursor and hit-testing. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Position, Song } from '../model/types';
import { beatSequence, drawSystem } from '../layout/draw';
import { findMeasure, hitTest, layoutTrack, noteLabel, type TrackLayout } from '../layout/layout';
import { textWidth } from '../layout/ops';
import { SvgOps } from '../render/SvgOps';
import { findNote } from '../model/operations';

/** Screen pixels per point at 100% zoom. */
export const PX_PER_PT = 1.4;
const GAP = 12;
const SHEET_PAD = 20;

interface Props {
  song: Song;
  cursor: Position;
  zoom: number;
  onCursor: (pos: Position) => void;
}

export function TabCanvas({ song, cursor, zoom, onCursor }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGRectElement>(null);
  const [containerW, setContainerW] = useState(900);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = zoom * PX_PER_PT;
  // Layout width in points: the visible width minus gutters, so measures wrap to the window.
  const sheetPx = Math.max(360, Math.min(containerW - 48, 1600 * zoom));
  const width = sheetPx / scale - SHEET_PAD * 2;

  const layout = useMemo(() => layoutTrack(song, cursor.track, { width, gap: GAP, showTempo: true }), [song, cursor.track, width]);
  const systemsOps = useMemo(() => {
    const seq = beatSequence(song, layout);
    return layout.systems.map((sys) => drawSystem(song, layout, sys, seq));
  }, [song, layout]);

  const totalH = layout.height + SHEET_PAD * 2;
  const totalW = width + SHEET_PAD * 2;

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor, layout]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const hit = hitTest(layout, pt.x - SHEET_PAD, pt.y - SHEET_PAD);
    if (hit) onCursor({ track: cursor.track, ...hit });
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto" data-testid="tab-canvas">
      <div className="flex justify-center px-6 py-6 min-w-fit">
        <svg
          ref={svgRef}
          width={totalW * scale}
          height={totalH * scale}
          viewBox={`0 0 ${totalW} ${totalH}`}
          className="rounded-sm cursor-text select-none shrink-0"
          style={{ background: 'var(--sheet)', boxShadow: 'var(--shadow-sheet)' }}
          onPointerDown={onPointerDown}
          role="application"
          aria-label="Tablature editor. Use arrow keys to move, numbers to enter frets."
        >
          <g transform={`translate(${SHEET_PAD} ${SHEET_PAD})`}>
            <CursorOverlay song={song} layout={layout} cursor={cursor} cursorRef={cursorRef} />
            {layout.systems.map((sys, i) => (
              <g key={i} transform={`translate(0 ${sys.y})`}>
                <SvgOps ops={systemsOps[i]} />
                {sys.measures
                  .filter((ml) => ml.overfull)
                  .map((ml) => (
                    <rect key={ml.measure} x={ml.x + 1} y={sys.staffTop - 4} width={ml.w - 2} height={2} fill="var(--danger)">
                      <title>Measure {ml.measure + 1} is longer than its time signature allows</title>
                    </rect>
                  ))}
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

function CursorOverlay({ song, layout, cursor, cursorRef }: { song: Song; layout: TrackLayout; cursor: Position; cursorRef: React.Ref<SVGRectElement> }) {
  const found = findMeasure(layout, cursor.measure);
  if (!found) return null;
  const { system, measure } = found;
  const bl = measure.beats[cursor.beat];
  if (!bl) return null;
  const m = layout.metrics;
  const note = findNote(song, cursor);
  const labelW = note ? textWidth(noteLabel(note.fret, note.techniques), m.fretSize, 'mono') : m.fretSize * 0.6;
  const w = Math.max(labelW + 5, 13);
  const h = m.fretSize * 1.25;
  const y = system.y + system.staffTop + cursor.string * m.gap;
  return (
    <g pointerEvents="none">
      <rect x={bl.slotX} y={system.y + system.staffTop - m.gap * 0.6} width={bl.slotW} height={system.staffBottom - system.staffTop + m.gap * 1.2} fill="var(--cursor-wash)" />
      <rect ref={cursorRef} x={bl.x - w / 2} y={y - h / 2} width={w} height={h} rx={2} fill="none" stroke="var(--cursor)" strokeWidth={1.4} style={{ scrollMargin: 48 }} />
    </g>
  );
}
