/**
 * Portable JSON project format:
 *   { "format": "guitar-tab-studio", "version": 1, "song": Song }
 * Parsing validates and normalises untrusted input; it never throws.
 */
import type { Beat, DurationValue, MasterBar, Measure, Note, NoteTechniques, Song, TimeSignature, Track } from '../model/types';
import { DURATION_VALUES, DYNAMICS, SCHEMA_VERSION, type Dynamic } from '../model/types';
import { newId } from '../model/factory';
import { MAX_CAPO, MAX_FRET, pitchToMidi } from '../model/tuning';

export const FORMAT_ID = 'guitar-tab-studio';

export type ParseResult = { ok: true; song: Song; warnings: string[] } | { ok: false; error: string };

export function serializeProject(song: Song): string {
  return JSON.stringify({ format: FORMAT_ID, version: SCHEMA_VERSION, song }, null, 2);
}

export function parseProject(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (!isObj(data)) return { ok: false, error: 'The file does not contain a project.' };
  // Accept either the wrapped format or a bare song object.
  const raw = data.format === FORMAT_ID ? data.song : data;
  if (data.format !== undefined && data.format !== FORMAT_ID) return { ok: false, error: `Unknown format "${String(data.format)}".` };
  if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) {
    return { ok: false, error: `This project was saved by a newer version (format v${data.version}).` };
  }
  return normalizeSong(raw);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function timeSig(v: unknown): TimeSignature | null {
  if (!isObj(v)) return null;
  const n = int(v.numerator, 1, 32);
  const d = int(v.denominator, 2, 16);
  if (n === null || d === null || ![2, 4, 8, 16].includes(d)) return null;
  return { numerator: n, denominator: d as TimeSignature['denominator'] };
}

function techniques(v: unknown): NoteTechniques {
  const t: NoteTechniques = {};
  if (!isObj(v)) return t;
  for (const key of ['legato', 'vibrato', 'palmMute', 'letRing', 'tapped', 'ghost', 'tie', 'dead', 'bendRelease', 'prebend', 'slap', 'pop', 'staccato', 'tremolo', 'fadeIn'] as const) {
    if (v[key] === true) t[key] = true;
  }
  if (v.slide === 'up' || v.slide === 'down' || v.slide === 'legato') t.slide = v.slide;
  if (v.harmonic === 'natural' || v.harmonic === 'artificial' || v.harmonic === 'pinch' || v.harmonic === 'tapped') t.harmonic = v.harmonic;
  if (v.accent === 'normal' || v.accent === 'heavy') t.accent = v.accent;
  if (typeof v.bend === 'number' && v.bend > 0 && v.bend <= 4) t.bend = v.bend;
  if (!t.bend) {
    delete t.bendRelease;
    delete t.prebend;
  }
  const grace = int(v.grace, 0, MAX_FRET);
  if (grace !== null) t.grace = grace;
  const trill = int(v.trill, 0, MAX_FRET);
  if (trill !== null) t.trill = trill;
  return t;
}

function normalizeSong(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, error: 'The project has no song data.' };
  const warnings: string[] = [];
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) return { ok: false, error: 'The project has no tracks.' };

  const meta = isObj(raw.meta) ? raw.meta : {};
  const ts = timeSig(raw.timeSignature) ?? { numerator: 4, denominator: 4 };
  const tempo = int(raw.tempo, 20, 400) ?? 120;

  const tracks: Track[] = [];
  for (const [ti, rt] of raw.tracks.entries()) {
    if (!isObj(rt)) return { ok: false, error: `Track ${ti + 1} is invalid.` };
    const inst = isObj(rt.instrument) ? rt.instrument : {};
    const tuning = Array.isArray(inst.tuning) ? inst.tuning.filter((p): p is string => typeof p === 'string' && pitchToMidi(p) !== null) : [];
    if (tuning.length < 4 || tuning.length > 8) return { ok: false, error: `Track ${ti + 1} has an invalid tuning.` };
    const measures: Measure[] = [];
    const rawMeasures = Array.isArray(rt.measures) ? rt.measures : [];
    for (const rm of rawMeasures) {
      const beats: Beat[] = [];
      const rawBeats = isObj(rm) && Array.isArray(rm.beats) ? rm.beats : [];
      for (const rb of rawBeats) {
        if (!isObj(rb)) continue;
        const d = isObj(rb.duration) ? rb.duration : {};
        const value = DURATION_VALUES.includes(d.value as DurationValue) ? (d.value as DurationValue) : 4;
        const notes: Note[] = [];
        const seen = new Set<number>();
        for (const rn of Array.isArray(rb.notes) ? rb.notes : []) {
          if (!isObj(rn)) continue;
          const s = int(rn.string, 0, tuning.length - 1);
          const f = int(rn.fret, 0, MAX_FRET);
          if (s === null || f === null || seen.has(s)) {
            warnings.push('Some invalid notes were skipped.');
            continue;
          }
          seen.add(s);
          notes.push({ string: s, fret: f, techniques: techniques(rn.techniques) });
        }
        notes.sort((a, b) => a.string - b.string);
        const beat: Beat = { id: str(rb.id, '') || newId(), duration: { value, dotted: d.dotted === true }, notes };
        if (rb.rest === true && notes.length === 0) beat.rest = true;
        const chord = str(rb.chord, '', 16).trim();
        if (chord) beat.chord = chord;
        const text = str(rb.text, '', 40).trim();
        if (text) beat.text = text;
        if (rb.stroke === 'up' || rb.stroke === 'down') beat.stroke = rb.stroke;
        if (DYNAMICS.includes(rb.dynamic as Dynamic)) beat.dynamic = rb.dynamic as Dynamic;
        beats.push(beat);
      }
      if (beats.length === 0) beats.push({ id: newId(), duration: { value: 4, dotted: false }, notes: [] });
      measures.push({ id: (isObj(rm) && str(rm.id, '')) || newId(), beats });
    }
    tracks.push({
      id: str(rt.id, '') || newId(),
      name: str(rt.name, `Track ${ti + 1}`, 60) || `Track ${ti + 1}`,
      instrument: { tuning, capo: int(inst.capo, 0, MAX_CAPO) ?? 0 },
      measures,
    });
  }

  const rawBars = Array.isArray(raw.masterBars) ? raw.masterBars : [];
  const count = Math.max(1, rawBars.length, ...tracks.map((t) => t.measures.length));
  const masterBars: MasterBar[] = [];
  for (let i = 0; i < count; i++) {
    const rb = rawBars[i];
    const mb: MasterBar = {};
    if (isObj(rb)) {
      const mts = timeSig(rb.timeSignature);
      if (mts) mb.timeSignature = mts;
      const mt = int(rb.tempo, 20, 400);
      if (mt) mb.tempo = mt;
    }
    masterBars.push(mb);
  }
  for (const t of tracks) {
    if (t.measures.length < count) warnings.push(`Track "${t.name}" was padded to ${count} measures.`);
    while (t.measures.length < count) t.measures.push({ id: newId(), beats: [{ id: newId(), duration: { value: 4, dotted: false }, notes: [] }] });
  }

  const now = new Date().toISOString();
  const song: Song = {
    schemaVersion: SCHEMA_VERSION,
    id: str(raw.id, '') || newId(),
    meta: {
      title: str(meta.title, 'Untitled') || 'Untitled',
      subtitle: str(meta.subtitle, ''),
      artist: str(meta.artist, ''),
      album: str(meta.album, ''),
      composer: str(meta.composer, ''),
      lyricist: str(meta.lyricist, ''),
      arranger: str(meta.arranger, ''),
      tabbedBy: str(meta.tabbedBy, ''),
      copyright: str(meta.copyright, '', 300),
      watermark: str(meta.watermark, '', 60),
    },
    tempo,
    timeSignature: ts,
    keySignature: str(raw.keySignature, 'C', 8) || 'C',
    masterBars,
    tracks,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
  return { ok: true, song, warnings: [...new Set(warnings)] };
}
