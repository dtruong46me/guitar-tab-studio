/**
 * Display list: a renderer-neutral description of notation. The same ops are drawn by the SVG
 * renderer (editor + print preview) and by the PDF writer, so the PDF matches what's on screen.
 * Units are PDF points (1/72 in); text `y` is the alphabetic baseline.
 */

/** `faint` is for watermarks: light enough that notation printed over it stays readable. */
export type InkColor = 'ink' | 'muted' | 'staff' | 'paper' | 'faint';
export type FontKind = 'sans' | 'mono';

export type PathCmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export type Op =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: InkColor; dash?: number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; c: InkColor }
  | { t: 'path'; d: PathCmd[]; c: InkColor; w?: number; fill?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number; c: InkColor; fill: boolean; w?: number }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      font: FontKind;
      bold?: boolean;
      italic?: boolean;
      anchor: 'start' | 'middle' | 'end';
      c: InkColor;
      /** Rotation in degrees, counter-clockwise around (x, y). */
      angle?: number;
    };

/** Approximate advance width used for layout. Mono is exact for Courier/JetBrains Mono (0.6em). */
export function textWidth(text: string, size: number, font: FontKind, bold = false): number {
  if (font === 'mono') return text.length * size * 0.6;
  let w = 0;
  for (const ch of text) {
    if ('il.,:;|!\'1'.includes(ch)) w += 0.28;
    else if ('mwMW'.includes(ch)) w += 0.85;
    else if (ch === ' ') w += 0.28;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else w += 0.53;
  }
  return w * size * (bold ? 1.06 : 1);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Conservative bounding box of an op (used to test for clipping and overlaps). */
export function opBounds(op: Op): Box {
  switch (op.t) {
    case 'line': {
      const x = Math.min(op.x1, op.x2);
      const y = Math.min(op.y1, op.y2);
      return { x: x - op.w / 2, y: y - op.w / 2, w: Math.abs(op.x2 - op.x1) + op.w, h: Math.abs(op.y2 - op.y1) + op.w };
    }
    case 'rect':
      return { x: op.x, y: op.y, w: op.w, h: op.h };
    case 'circle':
      return { x: op.cx - op.r, y: op.cy - op.r, w: op.r * 2, h: op.r * 2 };
    case 'path': {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const c of op.d) {
        for (let i = 1; i + 1 < c.length; i += 2) {
          xs.push(c[i] as number);
          ys.push(c[i + 1] as number);
        }
      }
      const pad = (op.w ?? 0) / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case 'text': {
      const w = textWidth(op.text, op.size, op.font, op.bold);
      const x = op.anchor === 'start' ? op.x : op.anchor === 'middle' ? op.x - w / 2 : op.x - w;
      const box = { x, y: op.y - op.size * 0.8, w, h: op.size };
      if (!op.angle) return box;
      // Bounding box of the rotated rectangle.
      const a = (-op.angle * Math.PI) / 180;
      const corners = [
        [box.x, box.y],
        [box.x + w, box.y],
        [box.x, box.y + box.h],
        [box.x + w, box.y + box.h],
      ].map(([px, py]) => [op.x + (px - op.x) * Math.cos(a) - (py - op.y) * Math.sin(a), op.y + (px - op.x) * Math.sin(a) + (py - op.y) * Math.cos(a)]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
  }
}

export function translateOps(ops: Op[], dx: number, dy: number): Op[] {
  return ops.map((op) => {
    switch (op.t) {
      case 'line':
        return { ...op, x1: op.x1 + dx, x2: op.x2 + dx, y1: op.y1 + dy, y2: op.y2 + dy };
      case 'rect':
        return { ...op, x: op.x + dx, y: op.y + dy };
      case 'circle':
        return { ...op, cx: op.cx + dx, cy: op.cy + dy };
      case 'text':
        return { ...op, x: op.x + dx, y: op.y + dy };
      case 'path':
        return {
          ...op,
          // Coordinates alternate x, y after the command letter.
          d: op.d.map((c) => c.map((v, i) => (i === 0 ? v : (v as number) + (i % 2 === 1 ? dx : dy))) as PathCmd),
        };
    }
  });
}
