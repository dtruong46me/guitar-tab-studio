import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Song } from '../src/model/types';
import { createNoiNayCoAnh } from '../src/model/examples/noiNayCoAnh';
import { createDemoSong } from '../src/model/demo';
import { paginate } from '../src/pdf/paginate';
import { pagesToPdf } from '../src/pdf/pdfWriter';
import { readPdf } from '../src/io/pdfTab/pdfReader';
import { analyzeTabPdf, fitRhythm } from '../src/io/pdfTab/analyze';

const font = (f: string) => readFileSync(`node_modules/@expo-google-fonts/inter/${f}`).toString('base64');
const fonts = {
  regular: font('400Regular/Inter_400Regular.ttf'),
  italic: font('400Regular_Italic/Inter_400Regular_Italic.ttf'),
  bold: font('700Bold/Inter_700Bold.ttf'),
  boldItalic: font('700Bold_Italic/Inter_700Bold_Italic.ttf'),
};

async function roundTrip(song: Song) {
  const pages = paginate(song, { orientation: 'portrait', tracks: [0] });
  const bytes = new Uint8Array(pagesToPdf(pages, song, { fonts }).output('arraybuffer'));
  return analyzeTabPdf(await readPdf(pdfjs as never, bytes));
}

/** Note onsets per measure as "fret@string" lists, ignoring rests. */
const onsets = (song: Song) => song.tracks[0].measures.map((m) => m.beats.filter((b) => b.notes.length).map((b) => b.notes.map((n) => (n.techniques.dead ? 'x' : n.fret) + '@' + n.string).join(' ')));
/** Start time (in 16ths) of every note beat per measure: the rhythm as heard. */
const timing = (song: Song) =>
  song.tracks[0].measures.map((m) => {
    let t = 0;
    return m.beats
      .flatMap((b) => {
        const at = b.notes.length ? [t] : [];
        t += (16 / b.duration.value) * (b.duration.dotted ? 1.5 : 1);
        return at;
      })
      .join(',');
  });

describe('rhythm fitting', () => {
  it('recovers durations from proportional spacing', () => {
    // Quarter, two eighths, half: spacing grows with duration.
    const k = 20;
    const d = [4, 2, 2, 8];
    const xs: number[] = [];
    let x = 10;
    for (const u of d) {
      xs.push(x);
      x += k * u ** 0.55;
    }
    expect(fitRhythm(xs, x, 16, { alpha: 0.55 })?.units).toEqual(d);
  });

  it('respects glyph limits and returns null when nothing fits', () => {
    expect(fitRhythm([0, 10, 20], 30, 16, { max: [2, 2, 2] })).toBeNull();
    const r = fitRhythm([0, 20, 40, 60], 80, 16, { max: [16, 16, 16, 4] });
    expect(r).not.toBeNull();
    expect(r!.units.reduce((a, b) => a + b, 0) + r!.rest).toBe(16);
  });
});

describe('PDF import', () => {
  it('reads back notes, measures, chords, sections, tempo and credits from an exported PDF', async () => {
    const original = createNoiNayCoAnh();
    const { song, report } = await roundTrip(original);
    expect(report.measures).toBe(original.masterBars.length);
    expect(song.meta.title).toBe('Nơi Này Có Anh');
    expect(song.meta.composer).toBe('Sơn Tùng M-TP');
    expect(song.meta.tabbedBy).toBe('Sang Pham');
    expect(song.tempo).toBe(172);
    expect(song.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    // Every note comes back on the right string, fret and beat.
    expect(onsets(song)).toEqual(onsets(original));
    const chords = (s: Song) => s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => (b.chord ? [b.chord] : [])));
    expect(chords(song)).toEqual(chords(original));
    const texts = (s: Song) => s.tracks[0].measures.flatMap((m) => m.beats.flatMap((b) => (b.text ? [b.text] : [])));
    expect(texts(song)).toEqual(['Intro', 'Groove']);
  });

  it('infers most rhythms from spacing alone', async () => {
    for (const original of [createNoiNayCoAnh(), createDemoSong()]) {
      const { song } = await roundTrip(original);
      const want = timing(original);
      const got = timing(song);
      const exact = want.filter((d, i) => d === got[i]).length;
      expect(exact / want.length).toBeGreaterThanOrEqual(0.65);
    }
  });

  it('rejects PDFs without tablature', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.text('Just a letter', 20, 20);
    const pages = await readPdf(pdfjs as never, new Uint8Array(doc.output('arraybuffer')));
    expect(() => analyzeTabPdf(pages)).toThrow(/No guitar tablature/);
  });
});
