/**
 * Unicode fonts for the PDF. The 14 standard PDF fonts only cover Latin-1, so text such as
 * "Nơi Này Có Anh" would print as garbage; Inter (SIL Open Font License) covers Vietnamese and
 * most Latin, Greek and Cyrillic text. Loaded on demand when a PDF is exported.
 */
import regularUrl from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import italicUrl from '@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url';
import boldUrl from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url';
import boldItalicUrl from '@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf?url';
import type { PdfFonts } from './pdfWriter';

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let cache: Promise<PdfFonts> | null = null;

export function loadPdfFonts(): Promise<PdfFonts> {
  if (!cache) {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Font ${url}: ${r.status}`)))).then(toBase64);
    cache = Promise.all([get(regularUrl), get(italicUrl), get(boldUrl), get(boldItalicUrl)]).then(([regular, italic, bold, boldItalic]) => ({ regular, italic, bold, boldItalic }));
    cache.catch(() => (cache = null));
  }
  return cache;
}
