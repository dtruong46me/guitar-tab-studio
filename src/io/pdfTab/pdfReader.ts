/**
 * Reads the raw drawing content of a PDF with pdf.js: positioned text runs and straight line
 * segments, in page points with a top-left origin. The tab analyzer works on this neutral form,
 * so it can be tested without pdf.js.
 */

export interface PdfText {
  str: string;
  /** Left edge of the run. */
  x: number;
  /** Baseline, measured from the top of the page. */
  y: number;
  /** Font size (em height). */
  size: number;
  /** Advance width of the whole run. */
  w: number;
  font: string;
}

export interface PdfSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PdfPage {
  width: number;
  height: number;
  texts: PdfText[];
  segs: PdfSeg[];
}

type PdfJs = typeof import('pdfjs-dist');
type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** pdf.js path drawing ops inside constructPath. */
const PATH = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

export async function readPdf(pdfjs: PdfJs, data: Uint8Array, maxPages = 40): Promise<PdfPage[]> {
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const [vx, vy, vw, vh] = page.view;
      const width = vw - vx;
      const height = vh - vy;
      const flipY = (y: number) => vh - y;

      const tc = await page.getTextContent();
      const texts: PdfText[] = [];
      for (const item of tc.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [a, b, , , e, f] = item.transform as number[];
        if (Math.abs(b) > 0.01) continue; // rotated labels (instrument names) carry no notation
        texts.push({ str: item.str, x: e - vx, y: flipY(f), size: Math.abs(a), w: item.width, font: item.fontName });
      }

      const ops = await page.getOperatorList();
      const segs: PdfSeg[] = [];
      let ctm: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      const pt = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4] - vx, flipY(ctm[1] * x + ctm[3] * y + ctm[5])];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === pdfjs.OPS.save) stack.push(ctm);
        else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === pdfjs.OPS.transform) ctm = multiply(ctm, args as Matrix);
        else if (fn === pdfjs.OPS.constructPath) collectSegments(args[1]?.[0], pt, segs);
      }
      pages.push({ width, height, texts, segs });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

/**
 * Turns a pdf.js path into straight segments: lines stay lines, and thin rectangles (how many
 * programs draw staff lines and bar lines) collapse to their centre line. Curves are skipped.
 */
function collectSegments(path: ArrayLike<number> | undefined, pt: (x: number, y: number) => [number, number], out: PdfSeg[]) {
  if (!path) return;
  let sub: [number, number][] = [];
  const flush = () => {
    if (sub.length === 2) {
      const [[x1, y1], [x2, y2]] = sub;
      out.push({ x1, y1, x2, y2 });
    } else if (sub.length >= 4 && sub.length <= 5) {
      const xs = sub.map((p) => p[0]);
      const ys = sub.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const axisAligned = sub.every((p, i) => i === 0 || Math.abs(p[0] - sub[i - 1][0]) < 0.05 || Math.abs(p[1] - sub[i - 1][1]) < 0.05);
      if (axisAligned && w < 3.5 && h > 3 * w) out.push({ x1: (Math.min(...xs) + Math.max(...xs)) / 2, y1: Math.min(...ys), x2: (Math.min(...xs) + Math.max(...xs)) / 2, y2: Math.max(...ys) });
      else if (axisAligned && h < 1.5 && w > 3 * h) out.push({ x1: Math.min(...xs), y1: (Math.min(...ys) + Math.max(...ys)) / 2, x2: Math.max(...xs), y2: (Math.min(...ys) + Math.max(...ys)) / 2 });
    } else if (sub.length > 2) {
      // A polyline: keep its straight pieces (some programs draw all staff lines as one path).
      for (let i = 1; i < sub.length; i++) out.push({ x1: sub[i - 1][0], y1: sub[i - 1][1], x2: sub[i][0], y2: sub[i][1] });
    }
    sub = [];
  };
  for (let i = 0; i < path.length; ) {
    const op = path[i];
    if (op === PATH.moveTo) {
      flush();
      sub.push(pt(path[i + 1], path[i + 2]));
      i += 3;
    } else if (op === PATH.lineTo) {
      sub.push(pt(path[i + 1], path[i + 2]));
      i += 3;
    } else if (op === PATH.curveTo) {
      flush();
      i += 7;
    } else if (op === PATH.quadraticCurveTo) {
      flush();
      i += 5;
    } else if (op === PATH.closePath) {
      i += 1;
    } else break;
  }
  flush();
}
