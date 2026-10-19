/** Renders display-list ops as SVG elements (editor canvas and print preview). */
import { memo } from 'react';
import type { InkColor, Op, PathCmd } from '../layout/ops';

export type FontMode = 'screen' | 'print';

const COLOR: Record<InkColor, string> = {
  ink: 'var(--notation-ink)',
  muted: 'var(--notation-muted)',
  staff: 'var(--staff-line)',
  paper: 'var(--sheet)',
};

/** Print mode uses the PDF's standard fonts so the preview matches the exported file. */
const FONTS: Record<FontMode, { sans: string; mono: string }> = {
  screen: { sans: 'Inter, "Segoe UI", system-ui, sans-serif', mono: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' },
  print: { sans: 'Helvetica, Arial, "Liberation Sans", sans-serif', mono: '"Courier New", Courier, "Liberation Mono", monospace' },
};

export function pathData(d: PathCmd[]): string {
  return d.map((c) => (c[0] === 'Z' ? 'Z' : `${c[0]}${c.slice(1).map((n) => +(n as number).toFixed(2)).join(' ')}`)).join('');
}

function renderOp(op: Op, i: number, mode: FontMode) {
  const color = COLOR[op.c];
  switch (op.t) {
    case 'line':
      return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={color} strokeWidth={op.w} strokeDasharray={op.dash?.join(' ')} />;
    case 'rect':
      return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={color} />;
    case 'circle':
      return op.fill ? <circle key={i} cx={op.cx} cy={op.cy} r={op.r} fill={color} /> : <circle key={i} cx={op.cx} cy={op.cy} r={op.r} fill="none" stroke={color} strokeWidth={op.w ?? 0.5} />;
    case 'path':
      return op.fill ? (
        <path key={i} d={pathData(op.d)} fill={color} />
      ) : (
        <path key={i} d={pathData(op.d)} fill="none" stroke={color} strokeWidth={op.w ?? 0.5} strokeLinecap="round" strokeLinejoin="round" />
      );
    case 'text':
      return (
        <text
          key={i}
          x={op.x}
          y={op.y}
          fontSize={op.size}
          fontFamily={FONTS[mode][op.font]}
          fontWeight={op.bold ? 700 : 400}
          fontStyle={op.italic ? 'italic' : undefined}
          textAnchor={op.anchor}
          fill={color}
          xmlSpace="preserve"
        >
          {op.text}
        </text>
      );
  }
}

export const SvgOps = memo(function SvgOps({ ops, mode = 'screen' }: { ops: Op[]; mode?: FontMode }) {
  return <g>{ops.map((op, i) => renderOp(op, i, mode))}</g>;
});
