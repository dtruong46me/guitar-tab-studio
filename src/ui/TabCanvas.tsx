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
  /** Beat being played, if playback is running or paused. */
  playhead?: { measure: number; beat: number } | null;
}

export function TabCanvas({ song, cursor, zoom, onCursor, playhead }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGRectElement>(null);
  const playheadRef = useRef<SVGRectElement>(null);
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

  // Keep the playing measure in view, like a page turner.
  useEffect(() => {
    playheadRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [playhead?.measure, layout]);

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
            {playhead && <PlayheadOverlay layout={layout} playhead={playhead} innerRef={playheadRef} />}
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

/** Amber wash over the playing measure and a bar over the playing beat. */
function PlayheadOverlay({ layout, playhead, innerRef }: { layout: TrackLayout; playhead: { measure: number; beat: number }; innerRef: React.Ref<SVGRectElement> }) {
  const found = findMeasure(layout, playhead.measure);
  if (!found) return null;
  const { system, measure } = found;
  const bl = measure.beats[playhead.beat];
  const top = system.y + system.staffTop - layout.metrics.gap * 0.8;
  const height = system.staffBottom - system.staffTop + layout.metrics.gap * 1.6;
  return (
    <g pointerEvents="none">
      <rect ref={innerRef} x={measure.x} y={top} width={measure.w} height={height} fill="var(--playhead)" opacity={0.08} style={{ scrollMargin: 64 }} />
      {bl && <rect x={bl.x - 1} y={top} width={2} height={height} rx={1} fill="var(--playhead)" />}
    </g>
  );
}
