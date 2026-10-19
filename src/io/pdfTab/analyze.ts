/**
 * Tab PDF analyzer: rebuilds a Song from the positioned text and lines of a tablature PDF
 * (Guitar Pro, MuseScore, TuxGuitar, this app...).
 *
 * - Tab staves are runs of 6 (or 7) evenly spaced horizontal lines; bar lines are vertical lines
 *   spanning a tab staff.
 * - Fret numbers are text on the string lines; notes at the same x form a beat.
 * - Rhythm is not printed in tab, so each measure's durations are chosen to fill the bar exactly
 *   while best matching the horizontal spacing (engravers space longer notes wider, roughly with
 *   duration^alpha). Music-font glyphs (SMuFL rests, noteheads, flags, dots) tighten the choice
 *   when the PDF has them.
 * - Chord names, section labels, tempo, H/P, let ring, P.M., dynamics and credits come from text.
 */
import type { Beat, DurationValue, MasterBar, Measure, Note, Song, SongMeta, TimeSignature } from '../../model/types';
import { SCHEMA_VERSION } from '../../model/types';
import { emptyMeta, newId } from '../../model/factory';
import { STANDARD_TUNING, TUNING_PRESETS } from '../../model/tuning';
import type { PdfPage, PdfText } from './pdfReader';

export interface ImportReport {
  measures: number;
  notes: number;
  /** Measures whose rhythm could not be fitted exactly. */
  uncertain: number[];
  warnings: string[];
}

interface Staff {
  top: number;
  spacing: number;
  lines: number;
  left: number;
  right: number;
}

interface Token {
  x: number;
  y: number;
  text: string;
  size: number;
}

interface Column {
  x: number;
  notes: { string: number; text: string }[];
}

interface Event {
  x: number;
  column?: Column;
  /** Upper bound on the event's duration, in 16ths, from notation glyphs. */
  max: number;
  /** Preferred duration in 16ths (rest glyph value), if known. */
  hint?: number;
}

/** Durations in 16th notes that the model can write. */
const UNITS = [1, 2, 3, 4, 6, 8, 12, 16];
const UNIT_TO_DURATION: Record<number, { value: DurationValue; dotted: boolean }> = {
  1: { value: 16, dotted: false },
  2: { value: 8, dotted: false },
  3: { value: 8, dotted: true },
  4: { value: 4, dotted: false },
  6: { value: 4, dotted: true },
  8: { value: 2, dotted: false },
  12: { value: 2, dotted: true },
  16: { value: 1, dotted: false },
};
/** Slight preference for plain values over dotted or very short ones when spacing is ambiguous. */
const PRIOR: Record<number, number> = { 1: 0.06, 2: 0, 3: 0.25, 4: 0, 6: 0.12, 8: 0.04, 12: 0.15, 16: 0.08 };
/** How strongly spacing grows with duration (spacing ~ duration^ALPHA). */
export const ALPHA = 0.55;
/** Cost of assuming an unprinted rest after the last note of a bar. */
const TRAILING_REST_COST = 0.35;

const SMUFL = {
  rests: { 0xe4e3: 16, 0xe4e4: 8, 0xe4e5: 4, 0xe4e6: 2, 0xe4e7: 1 } as Record<number, number>,
  heads: { 0xe0a2: 16, 0xe0a3: 12, 0xe0a4: 6, 0xe0a9: 6 } as Record<number, number>,
  flags: { 0xe240: 3, 0xe241: 3, 0xe242: 1, 0xe243: 1 } as Record<number, number>,
  dot: 0xe1e7,
  timeDigit0: 0xe080,
  common: 0xe08a,
};

const CHORD_RE = /^[A-G](?:#|b|♯|♭)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?\d*(?:(?:sus|add|maj)?\d+|b5|#5|b9|#9|#11|b13)*(?:\/[A-G](?:#|b|♯|♭)?)?$/;
const SECTION_RE = /^(intro|verse|pre-?chorus|chorus|bridge|outro|interlude|solo|coda|ending|instrumental|riff|refrain|hook|groove|break)\b.*$/i;
const DYNAMIC_RE = /^(pp|p|mp|mf|f|ff)$/;
const FRET_RE = /^(?:\(\d{1,2}\)|<\d{1,2}>|\d{1,2}|[xX])$/;

const isMusicFont = (s: string) => [...s].some((ch) => (ch.codePointAt(0) ?? 0) >= 0xe000 && (ch.codePointAt(0) ?? 0) < 0xf900);

// ---------- geometry ----------

/** Horizontal lines grouped by y with their x extent. */
export function horizontalLines(page: PdfPage): { y: number; left: number; right: number }[] {
  const rows: { y: number; left: number; right: number }[] = [];
  for (const s of page.segs) {
    if (Math.abs(s.y1 - s.y2) > 0.6 || Math.abs(s.x2 - s.x1) < 20) continue;
    const y = (s.y1 + s.y2) / 2;
    const left = Math.min(s.x1, s.x2);
    const right = Math.max(s.x1, s.x2);
    // Pieces at the same height are one staff line, even when drawn with gaps (around digits, slurs).
    const row = rows.find((r) => Math.abs(r.y - y) < 0.4);
    if (row) {
      row.left = Math.min(row.left, left);
      row.right = Math.max(row.right, right);
    } else rows.push({ y, left, right });
  }
  return rows.filter((r) => r.right - r.left > 80).sort((a, b) => a.y - b.y);
}

/** Runs of evenly spaced, overlapping lines. 6 or 7 lines = tab staff; 5 = standard staff. */
export function findStaves(page: PdfPage): { tabs: Staff[]; standards: Staff[] } {
  const rows = horizontalLines(page);
  const tabs: Staff[] = [];
  const standards: Staff[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    const gap = j < rows.length ? rows[j].y - rows[i].y : 0;
    while (
      j < rows.length &&
      gap >= 3 &&
      gap <= 14 &&
      Math.abs(rows[j].y - rows[j - 1].y - gap) < Math.max(0.6, gap * 0.08) &&
      Math.abs(rows[j].left - rows[i].left) < 40
    )
      j++;
    const run = rows.slice(i, j);
    // Use the widest extent: single lines are often interrupted around dense digits.
    const staff: Staff = { top: run[0].y, spacing: gap, lines: run.length, left: Math.min(...run.map((r) => r.left)), right: Math.max(...run.map((r) => r.right)) };
    if (run.length === 6 || run.length === 7) tabs.push(staff);
    else if (run.length === 5) standards.push(staff);
    // Only a real staff consumes its lines; a stray line (bracket, hairpin) must not swallow the
    // first line of the staff below it.
    i = run.length >= 5 ? j : i + 1;
  }
  return { tabs, standards };
}

const bottomOf = (s: Staff) => s.top + (s.lines - 1) * s.spacing;

/** x positions of bar lines crossing a tab staff, merged, including the staff's left edge. */
export function barlines(page: PdfPage, staff: Staff): number[] {
  const bottom = bottomOf(staff);
  const xs = page.segs
    .filter((s) => Math.abs(s.x1 - s.x2) < 0.8 && Math.min(s.y1, s.y2) <= staff.top + 1 && Math.max(s.y1, s.y2) >= bottom - 1 && s.x1 >= staff.left - 4 && s.x1 <= staff.right + 4)
    .map((s) => s.x1)
    .sort((a, b) => a - b);
  const merged: number[] = [];
  for (const x of xs) if (!merged.length || x - merged[merged.length - 1] > 1.5) merged.push(x);
  if (!merged.length || merged[0] > staff.left + 3) merged.unshift(staff.left);
  if (merged[merged.length - 1] < staff.right - 3) merged.push(staff.right);
  return merged;
}

/** Split text runs into single tokens with estimated x centres. */
function tokens(texts: PdfText[]): Token[] {
  const out: Token[] = [];
  for (const t of texts) {
    const parts = t.str.split(/(\s+)/);
    const total = t.str.length || 1;
    let offset = 0;
    for (const p of parts) {
      if (p.trim()) {
        const x = t.x + ((offset + p.length / 2) / total) * t.w;
        out.push({ x, y: t.y, text: p, size: t.size });
      }
      offset += p.length;
    }
  }
  return out;
}

/** Music-font glyphs as single characters with their centres. */
function glyphs(texts: PdfText[]): { code: number; x: number; y: number; size: number }[] {
  const out: { code: number; x: number; y: number; size: number }[] = [];
  for (const t of texts) {
    if (!isMusicFont(t.str)) continue;
    const chars = [...t.str];
    chars.forEach((ch, i) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0xe000 && code < 0xf900) out.push({ code, x: t.x + ((i + 0.5) / chars.length) * t.w, y: t.y, size: t.size });
    });
  }
  return out;
}

// ---------- rhythm ----------

/**
 * Pick durations (in 16ths) for events at the given x positions that fill `capacity` exactly and
 * best match the spacing. Returns null when no combination fits.
 */
export function fitRhythm(
  xs: number[],
  end: number,
  capacity: number,
  opts: { max?: number[]; hint?: (number | undefined)[]; k?: number[]; alpha?: number; pad?: number } = {},
): { units: number[]; rest: number; k: number; cost: number } | null {
  const n = xs.length;
  if (n === 0) return null;
  const alpha = opts.alpha ?? ALPHA;
  // The last note's space runs to the bar line, which sits a little further out (end padding).
  const gaps = xs.map((x, i) => (i + 1 < n ? Math.max(1, xs[i + 1] - x) : Math.max((end - x) * 0.35, end - x - (opts.pad ?? 0))));
  const allowed = xs.map((_, i) => UNITS.filter((u) => u <= (opts.max?.[i] ?? 16) && u <= capacity));
  if (allowed.some((a) => a.length === 0)) return null;
  const lg = gaps.map(Math.log);
  // Candidate scales: every gap matched to every allowed duration.
  const ks = opts.k ?? [...new Set(gaps.flatMap((g, i) => allowed[i].map((u) => +(g / u ** alpha).toFixed(3))))];
  let best: { units: number[]; rest: number; k: number; cost: number } | null = null;
  for (const k of ks) {
    const lk = Math.log(k);
    // dp[i][sum] = min cost for first i events using `sum` 16ths.
    const INF = Infinity;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(INF));
    const pick: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(-1));
    dp[0][0] = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s <= capacity; s++) {
        if (dp[i][s] === INF) continue;
        for (const u of allowed[i]) {
          if (s + u > capacity) continue;
          const r = lg[i] - lk - alpha * Math.log(u);
          let c = dp[i][s] + r * r + PRIOR[u];
          const h = opts.hint?.[i];
          if (h !== undefined && h !== u) c += 0.6;
          if (c < dp[i + 1][s + u]) {
            dp[i + 1][s + u] = c;
            pick[i + 1][s + u] = u;
          }
        }
      }
    }
    // The last event may be followed by an unprinted rest that shares its space.
    let end: { cost: number; u: number; rest: number; s: number } | null = null;
    const i = n - 1;
    for (let s = 0; s <= capacity; s++) {
      if (dp[i][s] === INF) continue;
      for (const u of allowed[i]) {
        for (const rest of [0, 2, 4, 8]) {
          if (s + u + rest !== capacity) continue;
          const width = u ** alpha + (rest ? rest ** alpha : 0);
          const r = lg[i] - lk - Math.log(width);
          let c = dp[i][s] + r * r + PRIOR[u] + (rest ? TRAILING_REST_COST : 0);
          const h = opts.hint?.[i];
          if (h !== undefined && h !== u) c += 0.6;
          if (!end || c < end.cost) end = { cost: c, u, rest, s };
        }
      }
    }
    if (!end) continue;
    if (!best || end.cost < best.cost) {
      const units: number[] = [end.u];
      let s = end.s;
      for (let j = i; j > 0; j--) {
        units.unshift(pick[j][s]);
        s -= pick[j][s];
      }
      best = { units, rest: end.rest, k, cost: end.cost };
    }
  }
  return best;
}

// ---------- analysis ----------

interface SystemData {
  page: number;
  staff: Staff;
  /** Area above the tab staff that belongs to this system (standard staff, chords, labels). */
  regionTop: number;
  measures: { start: number; end: number; events: Event[] }[];
  texts: Token[];
  markers: Token[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export interface AnalyzeOptions {
  /** Spacing exponent (default ALPHA). */
  alpha?: number;
  /** End-of-bar padding in staff spaces (chosen per document when omitted). */
  pad?: number;
}

export function analyzeTabPdf(pages: PdfPage[], options: AnalyzeOptions = {}): { song: Song; report: ImportReport } {
  const warnings: string[] = [];
  const systems: SystemData[] = [];
  let timeSig: TimeSignature | null = null;
  let strings = 6;

  pages.forEach((page, pi) => {
    const { tabs, standards } = findStaves(page);
    const toks = tokens(page.texts.filter((t) => !isMusicFont(t.str)));
    const marks = glyphs(page.texts);
    let prevBottom = 0;
    for (const staff of tabs) {
      const bottom = bottomOf(staff);
      const std = standards.filter((s) => bottomOf(s) < staff.top && s.top > prevBottom).pop();
      const regionTop = prevBottom;
      strings = staff.lines;
      const s = staff.spacing;

      // Fret tokens on the strings. Unusually large digits inside the staff are a time signature.
      const inStaff = toks.filter((t) => t.x > staff.left - 2 && t.x < staff.right + 2 && t.y - t.size * 0.35 > staff.top - s * 0.6 && t.y - t.size * 0.35 < bottom + s * 0.6);
      const fretSize = median(inStaff.filter((t) => FRET_RE.test(t.text)).map((t) => t.size)) || 8;
      const frets = inStaff.filter((t) => FRET_RE.test(t.text) && t.size < fretSize * 1.5);
      const bigDigits = inStaff.filter((t) => /^\d{1,2}$/.test(t.text) && t.size >= fretSize * 1.5).sort((a, b) => a.y - b.y);
      if (!timeSig && bigDigits.length >= 2) timeSig = toTimeSig(+bigDigits[0].text, +bigDigits[1].text);

      // Group into columns by x.
      const tol = Math.max(2.5, s * 0.45);
      const columns: Column[] = [];
      for (const t of [...frets].sort((a, b) => a.x - b.x)) {
        const string = Math.round((t.y - t.size * 0.35 - staff.top) / s);
        if (string < 0 || string >= staff.lines) continue;
        let col = columns.find((c) => Math.abs(c.x - t.x) <= tol);
        if (!col) columns.push((col = { x: t.x, notes: [] }));
        if (!col.notes.some((n) => n.string === string)) col.notes.push({ string, text: t.text });
      }

      // Notation glyphs of this system (between the previous tab staff and this one).
      const sysGlyphs = marks.filter((g) => g.y > regionTop && g.y < staff.top && g.x > staff.left - 4 && g.x < staff.right + 4);
      if (!timeSig) {
        const digits = sysGlyphs.filter((g) => g.code >= SMUFL.timeDigit0 && g.code <= SMUFL.timeDigit0 + 9).sort((a, b) => a.y - b.y);
        if (digits.length >= 2) timeSig = toTimeSig(digits[0].code - SMUFL.timeDigit0, digits[1].code - SMUFL.timeDigit0);
        else if (sysGlyphs.some((g) => g.code === SMUFL.common)) timeSig = { numerator: 4, denominator: 4 };
      }
      const headTol = (std?.spacing ?? s) * 1.6;

      const bars = barlines(page, staff);
      const measures: SystemData['measures'] = [];
      for (let b = 0; b + 1 < bars.length; b++) {
        const start = bars[b];
        const end = bars[b + 1];
        const cols = columns.filter((c) => c.x > start && c.x < end);
        const rests = sysGlyphs.filter((g) => SMUFL.rests[g.code] !== undefined && g.x > start && g.x < end && !cols.some((c) => Math.abs(c.x - g.x) <= headTol));
        // Skip slivers between double bar lines / repeat signs.
        if (!cols.length && !rests.length && end - start < 25) continue;
        const events: Event[] = [
          ...cols.map((c) => {
            const near = sysGlyphs.filter((g) => Math.abs(g.x - c.x) <= headTol);
            const heads = near.filter((g) => SMUFL.heads[g.code] !== undefined);
            const flags = near.filter((g) => SMUFL.flags[g.code] !== undefined);
            // A beat lasts until the next beat in any voice, so glyphs only give an upper bound.
            let max = heads.length ? Math.min(...heads.map((g) => SMUFL.heads[g.code])) : 16;
            if (flags.length) max = Math.min(max, ...flags.map((g) => SMUFL.flags[g.code]));
            return { x: c.x, column: c, max };
          }),
          ...rests.map((g) => {
            const dotted = sysGlyphs.some((d) => d.code === SMUFL.dot && d.x > g.x && d.x - g.x < headTol * 1.5 && Math.abs(d.y - g.y) < headTol * 2);
            const v = SMUFL.rests[g.code] * (dotted ? 1.5 : 1);
            return { x: g.x, max: 16, hint: v };
          }),
        ].sort((a, b) => a.x - b.x);
        measures.push({ start, end, events });
      }

      const sysTexts = toks.filter((t) => t.y > regionTop && t.y < bottom + s * 4 && !inStaff.includes(t));
      const markers = toks.filter((t) => /^(H|P|PM|P\.M\.)$/.test(t.text) && t.y > staff.top - s * 3 && t.y < bottom + s);
      systems.push({ page: pi, staff, regionTop, measures, texts: sysTexts, markers });
      prevBottom = bottom + s;
    }
  });

  const ts: TimeSignature = timeSig ?? { numerator: 4, denominator: 4 };
  const capacity = (ts.numerator * 16) / ts.denominator;
  if (!systems.length) throw new Error('No guitar tablature was found in this PDF. Only PDFs with a TAB staff can be imported.');

  // Rhythm: first per measure, then again with each system's typical spacing scale for consistency.
  // The engraving style (spacing exponent, end padding) is chosen as the one that explains the
  // whole document best.
  const solve = (alpha: number, padSpaces: number) => {
    let total = 0;
    const out: { sys: SystemData; m: SystemData['measures'][number]; units: number[] | null; rest: number }[] = [];
    for (const sys of systems) {
      const pad = padSpaces * sys.staff.spacing;
      const base = { alpha, pad };
      const fits = sys.measures.map((m) => (m.events.length ? fitRhythm(xsOf(m), m.end, capacity, { ...base, max: m.events.map((e) => e.max), hint: m.events.map((e) => e.hint) }) : null));
      const kMed = median(fits.flatMap((f) => (f ? [f.k] : [])));
      sys.measures.forEach((m, i) => {
        let fit = fits[i];
        if (m.events.length && kMed) {
          const ks = [0.8, 0.87, 0.93, 1, 1.07, 1.15, 1.25].map((f) => kMed * f);
          fit = fitRhythm(xsOf(m), m.end, capacity, { ...base, max: m.events.map((e) => e.max), hint: m.events.map((e) => e.hint), k: ks }) ?? fit;
        }
        total += fit ? fit.cost / Math.max(1, m.events.length) : 0;
        out.push({ sys, m, units: fit?.units ?? null, rest: fit?.rest ?? 0 });
      });
    }
    return { total, out };
  };
  // End padding depends on the program that engraved the PDF, so it is picked per document by
  // fit; the spacing exponent stays fixed (measured on hand-checked transcriptions).
  const alphas = [options.alpha ?? ALPHA];
  const pads = options.pad !== undefined ? [options.pad] : [0, 0.5, 1];
  let best: ReturnType<typeof solve> | null = null;
  for (const a of alphas) for (const p of pads) {
    const r = solve(a, p);
    if (!best || r.total < best.total) best = r;
  }
  const uncertain: number[] = [];
  const allMeasures = best!.out;

  // Drop empty measures at the very end (layout padding).
  while (allMeasures.length > 1 && !allMeasures[allMeasures.length - 1].m.events.length) allMeasures.pop();

  const measures: Measure[] = [];
  const masterBars: MasterBar[] = [];
  let noteCount = 0;
  const prevFret = new Map<number, number>();
  const beatAt = new Map<Column, { measure: number; beat: number }>();

  allMeasures.forEach(({ m, units, rest }, mi) => {
    const beats: Beat[] = [];
    if (!m.events.length) {
      beats.push({ id: newId(), duration: { value: 1, dotted: false }, notes: [] });
    } else {
      let use = units;
      if (!use) {
        uncertain.push(mi + 1);
        use = m.events.map(() => Math.max(1, Math.floor(capacity / m.events.length)));
      }
      m.events.forEach((e, ei) => {
        const notes: Note[] = [];
        for (const n of e.column?.notes ?? []) {
          const note = toNote(n.string, n.text, prevFret);
          if (note) {
            notes.push(note);
            noteCount++;
          }
        }
        notes.sort((a, b) => a.string - b.string);
        const beat: Beat = { id: newId(), duration: { ...UNIT_TO_DURATION[use![ei]] }, notes };
        if (!e.column) beat.rest = true;
        if (e.column) beatAt.set(e.column, { measure: mi, beat: beats.length });
        beats.push(beat);
      });
      if (units && rest) beats.push({ id: newId(), duration: { ...UNIT_TO_DURATION[rest] }, notes: [], rest: true });
    }
    measures.push({ id: newId(), beats });
    masterBars.push({});
  });

  // Text annotations and techniques, attached to the nearest beat.
  let tempo = 120;
  let tempoSet = false;
  const measureIndexOf = new Map(allMeasures.map((am, i) => [am.m, i]));
  for (const sys of systems) {
    const sysCols = sys.measures.flatMap((m) => m.events.flatMap((e) => (e.column ? [e.column] : [])));
    const nearest = (x: number, after = false) => {
      let best: Column | undefined;
      for (const c of sysCols) if ((!after || c.x >= x - 6) && (!best || Math.abs(c.x - x) < Math.abs(best.x - x))) best = c;
      return best;
    };
    const beatOf = (c: Column | undefined) => (c ? beatAt.get(c) : undefined);
    const firstMeasure = sys.measures.find((m) => measureIndexOf.has(m));

    // Chord names stand alone above the staff, within it horizontally. Matching whole lines keeps
    // words like the letters of "Tuning: E A D G B E" from being read as chords.
    for (const l of lines(sys.texts)) {
      if (l.y > sys.staff.top - sys.staff.spacing * 0.8 || l.x < sys.staff.left - 2 || !CHORD_RE.test(l.text)) continue;
      const centre = l.x + (l.text.length * l.size * 0.55) / 2;
      const pos = beatOf(nearest(centre, true));
      if (pos) measures[pos.measure].beats[pos.beat].chord = l.text;
    }
    // Section labels, joined per line (e.g. "Pre Chorus").
    for (const line of lines(sys.texts.filter((t) => t.y < sys.staff.top))) {
      if (!SECTION_RE.test(line.text)) continue;
      const pos = beatOf(nearest(line.x, true));
      if (pos) measures[pos.measure].beats[pos.beat].text = line.text.slice(0, 40);
    }
    for (const t of [...sys.texts, ...lines(sys.texts).map((l) => ({ ...l, x: l.x }))]) {
      const tm = /(?:^|\s)=\s*(\d{2,3})$/.exec(t.text);
      if (tm) {
        const bpm = Math.min(400, Math.max(20, +tm[1]));
        const pos = beatOf(nearest(t.x, true)) ?? (firstMeasure ? { measure: measureIndexOf.get(firstMeasure)!, beat: 0 } : undefined);
        if (!tempoSet) {
          tempo = bpm;
          tempoSet = true;
          if (pos && pos.measure > 0) masterBars[pos.measure].tempo = bpm;
        } else if (pos) masterBars[pos.measure].tempo = bpm;
      }
      if (DYNAMIC_RE.test(t.text)) {
        const pos = beatOf(nearest(t.x));
        if (pos) measures[pos.measure].beats[pos.beat].dynamic = t.text as Beat['dynamic'];
      }
    }
    // let ring / P.M. apply from their position to the end of the system.
    for (const line of lines(sys.texts)) {
      const kind = /let\s*ring/i.test(line.text) ? 'letRing' : /^P\.?M\.?/.test(line.text) ? 'palmMute' : null;
      if (!kind) continue;
      for (const c of sysCols) {
        if (c.x < line.x - 4) continue;
        const pos = beatOf(c);
        if (!pos) continue;
        for (const n of measures[pos.measure].beats[pos.beat].notes) if (!n.techniques.dead) n.techniques[kind] = true;
      }
    }
    // H / P between two notes on the same string: legato on the first one.
    for (const mk of sys.markers.filter((t) => t.text === 'H' || t.text === 'P')) {
      const before = sysCols.filter((c) => c.x < mk.x).sort((a, b) => b.x - a.x)[0];
      const after = sysCols.filter((c) => c.x > mk.x).sort((a, b) => a.x - b.x)[0];
      const p1 = beatOf(before);
      if (!p1 || !after) continue;
      const strs = after.notes.map((n) => n.string);
      const note = measures[p1.measure].beats[p1.beat].notes.filter((n) => strs.includes(n.string)).sort((a, b) => a.string - b.string)[0];
      if (note && !note.techniques.dead) note.techniques.legato = true;
    }
  }

  const song: Song = {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    meta: readMeta(pages[0], firstStaffTop(pages[0], systems.find((s) => s.page === 0))),
    tempo,
    timeSignature: ts,
    keySignature: 'C',
    masterBars,
    tracks: [
      {
        id: newId(),
        name: 'Guitar',
        instrument: { tuning: strings === 7 ? [...TUNING_PRESETS.find((p) => p.id === 'standard-7')!.tuning] : [...STANDARD_TUNING], capo: 0 },
        measures,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (uncertain.length) warnings.push(`Rhythm could not be fitted exactly in measure${uncertain.length > 1 ? 's' : ''} ${uncertain.slice(0, 8).join(', ')}${uncertain.length > 8 ? '...' : ''}.`);
  if (!timeSig) warnings.push('No time signature found; assumed 4/4.');
  return { song, report: { measures: measures.length, notes: noteCount, uncertain, warnings } };
}

const xsOf = (m: { events: Event[] }) => m.events.map((e) => e.x);

function toTimeSig(n: number, d: number): TimeSignature | null {
  if (n < 1 || n > 32 || ![2, 4, 8, 16].includes(d)) return null;
  return { numerator: n, denominator: d as TimeSignature['denominator'] };
}

/** "(5)" is a tie when it repeats the previous fret on that string, otherwise a ghost note. */
function toNote(string: number, text: string, prevFret: Map<number, number>): Note | null {
  if (/^[xX]$/.test(text)) return { string, fret: 0, techniques: { dead: true } };
  const m = /^([(<]?)(\d{1,2})[)>]?$/.exec(text);
  if (!m) return null;
  const fret = Math.min(30, +m[2]);
  const techniques: Note['techniques'] = {};
  if (m[1] === '(') {
    if (prevFret.get(string) === fret) techniques.tie = true;
    else techniques.ghost = true;
  } else if (m[1] === '<') techniques.harmonic = 'natural';
  prevFret.set(string, fret);
  return { string, fret, techniques };
}

/** Join tokens on the same baseline into lines of text, split where words are far apart. */
function lines(toks: Token[]): { x: number; y: number; text: string; size: number }[] {
  const rows: Token[][] = [];
  for (const t of [...toks].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - t.y) < Math.max(r[0].size, t.size) * 0.3);
    if (row) row.push(t);
    else rows.push([t]);
  }
  const out: { x: number; y: number; text: string; size: number }[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: { x: number; y: number; text: string; size: number; right: number } | null = null;
    for (const t of row) {
      const half = (t.text.length * t.size * 0.55) / 2;
      if (cur && t.x - half - cur.right < t.size * 1.5) {
        cur.text += ` ${t.text}`;
        cur.right = t.x + half;
      } else {
        if (cur) out.push(cur);
        cur = { x: t.x - half, y: t.y, text: t.text, size: t.size, right: t.x + half };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Top of the first staff on a page (standard staff if there is one above the first tab staff). */
function firstStaffTop(page: PdfPage | undefined, firstSystem: SystemData | undefined): number {
  if (!page || !firstSystem) return page ? page.height / 3 : 0;
  const std = findStaves(page).standards.filter((s) => s.top < firstSystem.staff.top);
  return std.length ? std[0].top : firstSystem.staff.top;
}

/** Title, subtitle, artist and credits from the area above the first staff of the first page. */
function readMeta(page: PdfPage | undefined, limit: number): SongMeta {
  const meta = emptyMeta('Imported tab');
  if (!page) return meta;
  const top = tokens(page.texts.filter((t) => !isMusicFont(t.str) && t.y < limit - 2));
  const ls = lines(top).filter(
    (l) =>
      !/^\d+(\s*\/\s*\d+)?$/.test(l.text) &&
      !/(^|\s)=\s*\d+$/.test(l.text) &&
      !/tuning|capo|\bBPM\b|let ring|^P\.?M\.?/i.test(l.text) &&
      !CHORD_RE.test(l.text) &&
      !SECTION_RE.test(l.text) &&
      !/^(moderate|slow|fast|allegro|andante|moderato|adagio|presto)/i.test(l.text),
  );
  if (!ls.length) return meta;
  const title = ls.reduce((a, b) => (b.size > a.size ? b : a));
  meta.title = title.text.slice(0, 120);
  const rest: string[] = [];
  for (const l of ls.filter((l) => l !== title && l.y > title.y - 2)) {
    const t = l.text.trim();
    const credit = /^(words\s+and\s+music|music\s+and\s+words|music|words|lyrics|tab|tabbed|transcribed|arranged|arr\.?)\s*(by)?\s*:?\s*(.+)$/i.exec(t);
    if (credit) {
      const who = credit[3].trim().slice(0, 120);
      const kind = credit[1].toLowerCase();
      if (kind.startsWith('words and') || kind.startsWith('music and')) meta.composer = meta.lyricist = who;
      else if (kind === 'music') meta.composer = who;
      else if (kind === 'words' || kind === 'lyrics') meta.lyricist = who;
      else if (kind.startsWith('arr')) meta.arranger = who;
      else meta.tabbedBy = who;
    } else rest.push(t);
  }
  if (rest[0]) meta.subtitle = rest[0].slice(0, 120);
  if (rest[1]) meta.artist = rest[1].slice(0, 120);
  return meta;
}
