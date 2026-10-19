/** Writes paginated display-list ops into a vector PDF with jsPDF (lines, paths and real text). */
import { jsPDF } from 'jspdf';
import type { Song } from '../model/types';
import type { InkColor, Op } from '../layout/ops';
import type { Page, PrintOptions } from './paginate';
import { paginate } from './paginate';

const RGB: Record<InkColor, [number, number, number]> = {
  ink: [21, 23, 27],
  muted: [93, 100, 112],
  staff: [128, 135, 147],
  paper: [255, 255, 255],
};

export function pagesToPdf(pages: Page[], song: Song, compress = true): jsPDF {
  const first = pages[0];
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: first && first.width > first.height ? 'landscape' : 'portrait',
    compress,
    putOnlyUsedFonts: true,
  });
  doc.setProperties({
    title: song.meta.title || 'Untitled',
    author: song.meta.tabbedBy || song.meta.artist || '',
    subject: song.meta.artist ? `${song.meta.title} — ${song.meta.artist}` : song.meta.title,
    creator: 'Guitar Tab Studio',
  });
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage('a4', page.width > page.height ? 'landscape' : 'portrait');
    for (const op of page.ops) drawOp(doc, op);
  });
  return doc;
}

function drawOp(doc: jsPDF, op: Op) {
  const [r, g, b] = RGB[op.c];
  switch (op.t) {
    case 'line':
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(op.w);
      doc.setLineDashPattern(op.dash ?? [], 0);
      doc.line(op.x1, op.y1, op.x2, op.y2);
      if (op.dash) doc.setLineDashPattern([], 0);
      break;
    case 'rect':
      doc.setFillColor(r, g, b);
      doc.rect(op.x, op.y, op.w, op.h, 'F');
      break;
    case 'circle':
      if (op.fill) {
        doc.setFillColor(r, g, b);
        doc.circle(op.cx, op.cy, op.r, 'F');
      } else {
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(op.w ?? 0.5);
        doc.circle(op.cx, op.cy, op.r, 'S');
      }
      break;
    case 'path': {
      for (const c of op.d) {
        if (c[0] === 'M') doc.moveTo(c[1], c[2]);
        else if (c[0] === 'L') doc.lineTo(c[1], c[2]);
        else if (c[0] === 'C') doc.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        else doc.close();
      }
      if (op.fill) {
        doc.setFillColor(r, g, b);
        doc.fill();
      } else {
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(op.w ?? 0.5);
        doc.setLineDashPattern([], 0);
        doc.stroke();
      }
      break;
    }
    case 'text': {
      const family = op.font === 'mono' ? 'courier' : 'helvetica';
      const style = op.bold && op.italic ? 'bolditalic' : op.bold ? 'bold' : op.italic ? 'italic' : 'normal';
      doc.setFont(family, style);
      doc.setFontSize(op.size);
      doc.setTextColor(r, g, b);
      const align = op.anchor === 'start' ? 'left' : op.anchor === 'middle' ? 'center' : 'right';
      doc.text(op.text, op.x, op.y, { align, baseline: 'alphabetic' });
      break;
    }
  }
}

export function exportPdf(song: Song, opts: PrintOptions): { doc: jsPDF; pages: Page[] } {
  const pages = paginate(song, opts);
  return { doc: pagesToPdf(pages, song), pages };
}

export function pdfFileName(song: Song): string {
  const base = [song.meta.artist, song.meta.title || 'Untitled'].filter(Boolean).join(' - ');
  return `${base.replace(/[\\/:*?"<>|]+/g, '').trim() || 'tab'}.pdf`;
}
