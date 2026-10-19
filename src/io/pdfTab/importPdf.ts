/** Browser entry point for importing a tab PDF (pdf.js and its worker are loaded on demand). */
// The legacy build polyfills newer JavaScript (e.g. Map.getOrInsertComputed) that many browsers lack.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { analyzeTabPdf, type ImportReport } from './analyze';
import { readPdf } from './pdfReader';
import type { Song } from '../../model/types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function importTabPdf(file: File): Promise<{ song: Song; report: ImportReport }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pages = await readPdf(pdfjs as never, data);
  const result = analyzeTabPdf(pages);
  if (result.song.meta.title === 'Imported tab') result.song.meta.title = file.name.replace(/\.pdf$/i, '').slice(0, 120);
  return result;
}
