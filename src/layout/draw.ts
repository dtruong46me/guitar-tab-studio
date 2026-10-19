/**
 * Notation drawing: converts a laid-out system into display-list ops (coordinates relative to the
 * system's top-left corner). Shared by the editor, the print preview and the PDF writer.
 */
import type { Beat, Measure, Note, Song } from '../model/types';
import { pitchClass } from '../model/tuning';
import type { MeasureLayout, SystemLayout, TrackLayout } from './layout';
import { beatLead, chordSize, noteLabel } from './layout';
import type { Op } from './ops';
import { textWidth } from './ops';

interface BeatRef {
  system: number;
  measure: number;
  beat: number;
  x: number;
  data: Beat;
}

/** All beats of the track in playing order with their system and x position. */
export function beatSequence(song: Song, layout: TrackLayout): BeatRef[] {
  const out: BeatRef[] = [];
  const t = song.tracks[layout.track];
  for (const sys of layout.systems) {
    for (const ml of sys.measures) {
      for (const bl of ml.beats) out.push({ system: sys.index, measure: ml.measure, beat: bl.beat, x: bl.x, data: t.measures[ml.measure].beats[bl.beat] });
    }
  }
  return out;
}

const BEND_LABEL: Record<number, string> = { 1: '1/2', 2: 'full', 3: '1 1/2', 4: '2' };

export function drawSystem(song: Song, layout: TrackLayout, system: SystemLayout, sequence: BeatRef[] = beatSequence(song, layout)): Op[] {
  const ops: Op[] = [];
  const m = layout.metrics;
  const { u, gap } = m;
  const track = song.tracks[layout.track];
  const strings = layout.strings;
  const right = system.measures.length ? system.measures[system.measures.length - 1].x + system.measures[system.measures.length - 1].w : layout.width;
  const sy = (s: number) => system.staffTop + s * gap;
  const staffH = system.staffBottom - system.staffTop;
  const lastMeasureOfSong = song.masterBars.length - 1;

  // Strings and string names.
  for (let s = 0; s < strings; s++) {
    ops.push({ t: 'line', x1: m.namesW, y1: sy(s), x2: right, y2: sy(s), w: 0.6 * u, c: 'staff' });
    ops.push({ t: 'text', x: m.namesW - 3 * u, y: sy(s) + m.smallSize * 0.35, text: pitchClass(track.instrument.tuning[s]), size: m.smallSize, font: 'mono', anchor: 'end', c: 'muted' });
  }

  // TAB clef.
  ops.push({ t: 'rect', x: m.namesW + 0.6 * u, y: system.staffTop + 1.5 * u, w: m.clefW - 0.6 * u, h: staffH - 3 * u, c: 'paper' });
  const clefSize = Math.min(staffH / 3.2, 13 * u);
  ['T', 'A', 'B'].forEach((ch, i) => {
    const cy = system.staffTop + (staffH * (i + 0.5)) / 3;
    ops.push({ t: 'text', x: m.namesW + m.clefW / 2 - u, y: cy + clefSize * 0.36, text: ch, size: clefSize, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
  });

  // Opening bar line.
  ops.push({ t: 'line', x1: m.namesW, y1: system.staffTop, x2: m.namesW, y2: system.staffBottom, w: 0.8 * u, c: 'ink' });

  // Tempo mark.
  if (system.rows.tempoY !== undefined) {
    const ty = system.rows.tempoY;
    const hx = m.namesW + 2 * u;
    ops.push({ t: 'circle', cx: hx, cy: ty - 1.6 * u, r: 2 * u, c: 'ink', fill: true });
    ops.push({ t: 'line', x1: hx + 1.8 * u, y1: ty - 1.6 * u, x2: hx + 1.8 * u, y2: ty - 9.5 * u, w: 0.7 * u, c: 'ink' });
    ops.push({ t: 'text', x: hx + 4 * u, y: ty, text: `= ${tempoAt(song, system.measures[0]?.measure ?? 0)}`, size: 8.5 * u, font: 'sans', bold: true, anchor: 'start', c: 'ink' });
  }

  for (const ml of system.measures) drawMeasure(ops, song, layout, system, ml, ml.measure === lastMeasureOfSong);

  drawRuns(ops, layout, system, sequence, 'palmMute', 'P.M.', system.rows.palmMuteY, right);
  drawRuns(ops, layout, system, sequence, 'letRing', 'let ring', system.rows.letRingY, right);
  drawConnections(ops, layout, system, sequence, right);
  drawRhythm(ops, layout, system, track.measures);
  return ops;
}

function tempoAt(song: Song, measure: number): number {
  let tempo = song.tempo;
  for (let i = 0; i <= measure && i < song.masterBars.length; i++) if (song.masterBars[i].tempo) tempo = song.masterBars[i].tempo!;
  return tempo;
}

function drawMeasure(ops: Op[], song: Song, layout: TrackLayout, system: SystemLayout, ml: MeasureLayout, isFinal: boolean) {
  const m = layout.metrics;
  const { u, gap } = m;
  const track = song.tracks[layout.track];
  const measure = track.measures[ml.measure];
  const sy = (s: number) => system.staffTop + s * gap;
  const end = ml.x + ml.w;
  const midY = (system.staffTop + system.staffBottom) / 2;

  // Bar line(s).
  if (isFinal) {
    ops.push({ t: 'line', x1: end - 3.5 * u, y1: system.staffTop, x2: end - 3.5 * u, y2: system.staffBottom, w: 0.8 * u, c: 'ink' });
    ops.push({ t: 'line', x1: end - 1.2 * u, y1: system.staffTop, x2: end - 1.2 * u, y2: system.staffBottom, w: 2.4 * u, c: 'ink' });
  } else {
    ops.push({ t: 'line', x1: end, y1: system.staffTop, x2: end, y2: system.staffBottom, w: 0.8 * u, c: 'ink' });
  }

  // Measure number.
  ops.push({ t: 'text', x: (ml.x === m.headerW ? m.namesW : ml.x) + 1.5 * u, y: system.rows.measureNumberY, text: String(ml.measure + 1), size: 7 * u, font: 'mono', anchor: 'start', c: 'muted' });

  // Time signature.
  if (ml.showTimeSignature) {
    const size = Math.min((system.staffBottom - system.staffTop) * 0.5, 22 * u);
    const cx = ml.x + m.timeSigW / 2 + 2 * u;
    ops.push({ t: 'rect', x: cx - size * 0.45, y: system.staffTop + u, w: size * 0.9, h: system.staffBottom - system.staffTop - 2 * u, c: 'paper' });
    ops.push({ t: 'text', x: cx, y: midY - 0.8 * u, text: String(ml.timeSignature.numerator), size, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
    ops.push({ t: 'text', x: cx, y: midY + size * 0.72, text: String(ml.timeSignature.denominator), size, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
  }

  for (const bl of ml.beats) {
    const beat = measure.beats[bl.beat];
    // Beat-level markings apply to rests and empty beats too.
    if (beat.text && system.rows.textY !== undefined) {
      ops.push({ t: 'text', x: bl.x - 4 * u, y: system.rows.textY, text: beat.text, size: 8.5 * u, font: 'sans', bold: true, anchor: 'start', c: 'ink' });
    }
    if (beat.chord && system.rows.chordY !== undefined) {
      ops.push({ t: 'text', x: bl.x, y: system.rows.chordY, text: beat.chord, size: chordSize(m), font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
    }
    if (beat.dynamic && system.rows.dynamicY !== undefined) {
      ops.push({ t: 'text', x: bl.x, y: system.rows.dynamicY, text: beat.dynamic, size: 9 * u, font: 'sans', bold: true, italic: true, anchor: 'middle', c: 'ink' });
    }
    if (beat.notes.length === 0) {
      // Empty beats stay blank; only written rests get a symbol.
      if (beat.rest) drawRest(ops, bl.x, midY, beat, u);
      continue;
    }
    const letters: string[] = [];
    const add = (l: string) => !letters.includes(l) && letters.push(l);
    let staccato = false;
    let fadeIn = false;
    for (const n of beat.notes) {
      const t = n.techniques;
      const label = noteLabel(n.fret, t);
      const w = textWidth(label, m.fretSize, 'mono');
      const y = sy(n.string);
      ops.push({ t: 'rect', x: bl.x - w / 2 - 1 * u, y: y - m.fretSize * 0.48, w: w + 2 * u, h: m.fretSize * 0.96, c: 'paper' });
      ops.push({ t: 'text', x: bl.x, y: y + m.fretSize * 0.36, text: label, size: m.fretSize, font: 'mono', bold: true, anchor: 'middle', c: 'ink' });
      if (t.grace !== undefined) drawGrace(ops, bl.x - w / 2, y, t.grace, m.fretSize, u);
      if (t.accent) add(t.accent === 'heavy' ? '^' : '>');
      if (t.tapped) add('T');
      if (t.slap) add('S');
      if (t.pop) add('P');
      if (t.trill !== undefined) add('tr');
      if (t.harmonic === 'artificial') add('A.H.');
      if (t.harmonic === 'pinch') add('P.H.');
      if (t.harmonic === 'tapped') add('T.H.');
      if (t.staccato) staccato = true;
      if (t.fadeIn) fadeIn = true;
      if (t.bend) drawBend(ops, bl.x + w / 2, y, system, n, u, w);
      if (t.vibrato && system.rows.vibratoY !== undefined) drawVibrato(ops, bl.x - 2 * u, Math.min(bl.slotW - 3 * u, 16 * u), system.rows.vibratoY, u);
    }
    const ly = system.rows.lettersY;
    let lx = bl.x;
    if (letters.length) {
      const text = letters.join(' ');
      ops.push({ t: 'text', x: bl.x, y: ly, text, size: m.smallSize, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
      lx = bl.x + textWidth(text, m.smallSize, 'sans', true) / 2 + 2.5 * u;
    }
    if (staccato) ops.push({ t: 'circle', cx: letters.length ? lx : bl.x, cy: ly - 2.5 * u, r: 1.1 * u, c: 'ink', fill: true });
    if (fadeIn) {
      const x1 = bl.x - 12 * u;
      const x2 = bl.x - 4 * u;
      ops.push({ t: 'path', d: [['M', x2, ly - 5 * u], ['L', x1, ly - 2.5 * u], ['L', x2, ly]], c: 'ink', w: 0.7 * u });
    }
    if (beat.stroke) drawStroke(ops, bl.x - beatLead(beat, m) + 1 * u, beat, sy, beat.stroke, u);
  }
}

/** Small fret number just before the main note, joined by a slur. */
function drawGrace(ops: Op[], noteLeft: number, y: number, fret: number, fretSize: number, u: number) {
  const size = fretSize * 0.68;
  const label = String(fret);
  const w = textWidth(label, size, 'mono');
  const cx = noteLeft - 3.5 * u - w / 2;
  ops.push({ t: 'rect', x: cx - w / 2 - 0.6 * u, y: y - size * 0.48, w: w + 1.2 * u, h: size * 0.96, c: 'paper' });
  ops.push({ t: 'text', x: cx, y: y + size * 0.36, text: label, size, font: 'mono', bold: true, anchor: 'middle', c: 'ink' });
  ops.push({ t: 'path', d: [['M', cx, y - size * 0.7], ['C', cx + 1 * u, y - size * 1.2, noteLeft - 0.5 * u, y - size * 1.2, noteLeft + 0.5 * u, y - size * 0.7]], c: 'ink', w: 0.6 * u });
}

/** Strum arrow left of the chord: up arrow for an upstroke, down arrow for a downstroke. */
function drawStroke(ops: Op[], x: number, beat: Beat, sy: (s: number) => number, dir: 'up' | 'down', u: number) {
  const strings = beat.notes.map((n) => n.string);
  let top = sy(Math.min(...strings)) - 3 * u;
  let bottom = sy(Math.max(...strings)) + 3 * u;
  if (bottom - top < 10 * u) {
    const mid = (top + bottom) / 2;
    top = mid - 5 * u;
    bottom = mid + 5 * u;
  }
  ops.push({ t: 'line', x1: x, y1: top, x2: x, y2: bottom, w: 0.8 * u, c: 'ink' });
  const tip = dir === 'up' ? top - 1 * u : bottom + 1 * u;
  const base = dir === 'up' ? tip + 3.5 * u : tip - 3.5 * u;
  ops.push({ t: 'path', d: [['M', x - 1.8 * u, base], ['L', x, tip], ['L', x + 1.8 * u, base], ['Z']], c: 'ink', fill: true });
}

function drawRest(ops: Op[], x: number, midY: number, beat: Beat, u: number) {
  const v = beat.duration.value;
  const w = 1.4 * u;
  if (v === 1) {
    ops.push({ t: 'rect', x: x - 4 * u, y: midY - 4 * u, w: 8 * u, h: 3 * u, c: 'ink' });
  } else if (v === 2) {
    ops.push({ t: 'rect', x: x - 4 * u, y: midY - 1 * u, w: 8 * u, h: 3 * u, c: 'ink' });
  } else if (v === 4) {
    ops.push({ t: 'rect', x: x - 4 * u, y: midY - 10 * u, w: 8 * u, h: 20 * u, c: 'paper' });
    ops.push({
      t: 'path',
      d: [['M', x - 1.5 * u, midY - 9 * u], ['L', x + 2.5 * u, midY - 4 * u], ['L', x - 1.5 * u, midY], ['L', x + 2.5 * u, midY + 4.5 * u], ['C', x - 2 * u, midY + 3 * u, x - 2 * u, midY + 7 * u, x + 0.5 * u, midY + 9 * u]],
      c: 'ink',
      w,
    });
  } else {
    const flags = v === 8 ? 1 : 2;
    ops.push({ t: 'rect', x: x - 4 * u, y: midY - 8 * u, w: 9 * u, h: 16 * u, c: 'paper' });
    ops.push({ t: 'line', x1: x + 3 * u, y1: midY - 6 * u, x2: x - 1 * u, y2: midY + 7 * u, w: 1.1 * u, c: 'ink' });
    for (let i = 0; i < flags; i++) {
      const fy = midY - 6 * u + i * 4 * u;
      const fx = x + 3 * u - i * 1.2 * u;
      ops.push({ t: 'circle', cx: fx - 4.5 * u, cy: fy - 0.2 * u, r: 1.4 * u, c: 'ink', fill: true });
      ops.push({ t: 'line', x1: fx - 4.5 * u, y1: fy + 0.8 * u, x2: fx, y2: fy, w: 0.9 * u, c: 'ink' });
    }
  }
  if (beat.duration.dotted) ops.push({ t: 'circle', cx: x + 5.5 * u, cy: midY - 1 * u, r: 1.1 * u, c: 'ink', fill: true });
}

function drawBend(ops: Op[], x: number, y: number, system: SystemLayout, n: Note, u: number, labelW = 0) {
  const tipY = system.rows.lettersY + 2.5 * u;
  const arrow = (ax: number, ay: number, up: boolean) => {
    const by = up ? ay + 2.4 * u : ay - 2.4 * u;
    ops.push({ t: 'path', d: [['M', ax - 1.6 * u, by], ['L', ax, ay], ['L', ax + 1.6 * u, by], ['Z']], c: 'ink', fill: true });
  };
  let tx: number;
  if (n.techniques.prebend) {
    // Pre-bend: a straight arrow up from the note itself.
    tx = x - labelW / 2;
    ops.push({ t: 'line', x1: tx, y1: y - 5 * u, x2: tx, y2: tipY + 2 * u, w: 0.8 * u, c: 'ink' });
    arrow(tx, tipY, true);
  } else {
    const sx = x + 0.8 * u;
    tx = x + 6.5 * u;
    ops.push({ t: 'path', d: [['M', sx, y], ['C', tx, y, tx, y, tx, tipY + 2 * u]], c: 'ink', w: 0.8 * u });
    arrow(tx, tipY, true);
  }
  if (n.techniques.bendRelease) {
    const rx = Math.max(tx, x) + 5 * u;
    ops.push({ t: 'path', d: [['M', tx, tipY + 2 * u], ['C', tx + 0.5 * u, tipY + 2 * u, rx, tipY + 4 * u, rx, y - 4 * u]], c: 'ink', w: 0.8 * u });
    arrow(rx, y - 4 * u, false);
  }
  const label = BEND_LABEL[n.techniques.bend ?? 2] ?? String(n.techniques.bend);
  ops.push({ t: 'text', x: tx, y: system.rows.lettersY, text: label, size: 7 * u, font: 'sans', anchor: 'middle', c: 'ink' });
}

function drawVibrato(ops: Op[], x: number, width: number, y: number, u: number) {
  const d: Op & { t: 'path' } = { t: 'path', d: [['M', x, y]], c: 'ink', w: 0.9 * u };
  const step = 2 * u;
  let up = true;
  for (let cx = x + step; cx <= x + width; cx += step) {
    d.d.push(['L', cx, y + (up ? -1.6 * u : 1.6 * u)]);
    up = !up;
  }
  if (d.d.length > 1) ops.push(d);
}

/** Palm mute / let ring: label at the first beat of a run, dashed extension, closing tick. */
function drawRuns(ops: Op[], layout: TrackLayout, system: SystemLayout, seq: BeatRef[], key: 'palmMute' | 'letRing', label: string, y: number | undefined, right: number) {
  if (y === undefined) return;
  const u = layout.metrics.u;
  const size = layout.metrics.smallSize;
  const has = (b: Beat) => b.notes.some((n) => n.techniques[key]);
  const inSys = seq.map((r, i) => ({ r, i })).filter(({ r }) => r.system === system.index);
  let k = 0;
  while (k < inSys.length) {
    if (!has(inSys[k].r.data)) {
      k++;
      continue;
    }
    const start = k;
    while (k + 1 < inSys.length && has(inSys[k + 1].r.data)) k++;
    const first = inSys[start].r;
    const last = inSys[k];
    const continues = last.i + 1 < seq.length && has(seq[last.i + 1].data) && seq[last.i + 1].system !== system.index;
    const textX = first.x - 4 * u;
    const textW = textWidth(label, size, 'sans', true);
    ops.push({ t: 'text', x: textX, y, text: label, size, font: 'sans', bold: true, anchor: 'start', c: 'ink' });
    const dashStart = textX + textW + 2 * u;
    const endX = continues ? right : last.r.x + 5 * u;
    if (endX > dashStart) {
      ops.push({ t: 'line', x1: dashStart, y1: y - size * 0.3, x2: endX, y2: y - size * 0.3, w: 0.6 * u, c: 'ink', dash: [2 * u, 1.6 * u] });
    }
    if (!continues) ops.push({ t: 'line', x1: Math.max(endX, dashStart), y1: y - size * 0.3, x2: Math.max(endX, dashStart), y2: y + size * 0.15, w: 0.6 * u, c: 'ink' });
    k++;
  }
}

/** Hammer-on/pull-off slurs and slides between consecutive notes on the same string. */
function drawConnections(ops: Op[], layout: TrackLayout, system: SystemLayout, seq: BeatRef[], right: number) {
  const m = layout.metrics;
  const { u, gap } = m;
  seq.forEach((ref, i) => {
    if (ref.system !== system.index) return;
    for (const n of ref.data.notes) {
      const { legato, slide } = n.techniques;
      if (!legato && !slide) continue;
      const y = system.staffTop + n.string * gap;
      const w = textWidth(noteLabel(n.fret, n.techniques), m.fretSize, 'mono');
      const sx = ref.x + w / 2 + 0.5 * u;
      const next = seq[i + 1];
      const target = next?.data.notes.find((x) => x.string === n.string);
      const sameSystem = next && next.system === system.index;
      let ex = right - 1 * u;
      if (target && sameSystem) ex = next.x - textWidth(noteLabel(target.fret, target.techniques), m.fretSize, 'mono') / 2 - 0.5 * u;
      if (legato) {
        if (!target) continue;
        const top = y - gap * 0.85;
        ops.push({ t: 'path', d: [['M', sx, y - gap * 0.4], ['C', sx + 1.5 * u, top, ex - 1.5 * u, top, ex, y - gap * 0.4]], c: 'ink', w: 0.7 * u });
        if (target.fret !== n.fret) {
          ops.push({ t: 'text', x: (sx + ex) / 2, y: system.rows.lettersY, text: target.fret > n.fret ? 'H' : 'P', size: m.smallSize, font: 'sans', bold: true, anchor: 'middle', c: 'ink' });
        }
      } else if (slide) {
        const h = 2.6 * u;
        if (slide === 'legato' && target) {
          const up = target.fret >= n.fret;
          ops.push({ t: 'line', x1: sx + u, y1: y + (up ? h : -h), x2: ex - u, y2: y + (up ? -h : h), w: 0.8 * u, c: 'ink' });
        } else {
          const up = slide !== 'down';
          ops.push({ t: 'line', x1: sx + u, y1: y + (up ? h : -h), x2: sx + 7 * u, y2: y + (up ? -h : h), w: 0.8 * u, c: 'ink' });
        }
      }
    }
  });
}

/** Rhythm stems, beams and flags below the staff. */
function drawRhythm(ops: Op[], layout: TrackLayout, system: SystemLayout, measures: Measure[]) {
  const u = layout.metrics.u;
  const top = system.rhythmTop;
  const bottom = top + layout.metrics.stemLen;
  const beamW = 2 * u;
  for (const ml of system.measures) {
    const ts = ml.timeSignature;
    const groupTicks = ts.denominator === 8 && ts.numerator % 3 === 0 ? 1440 : ts.denominator === 16 ? 480 : 960;
    const beats = ml.beats.map((bl) => ({ bl, data: measures[ml.measure].beats[bl.beat] }));
    // Group beamable (eighth or shorter, non-rest) beats that fall in the same beat group.
    const groups: { bl: (typeof beats)[number]['bl']; data: Beat }[][] = [];
    let cur: typeof groups[number] = [];
    let curGroup = -1;
    for (const b of beats) {
      const beamable = b.data.notes.length > 0 && b.data.duration.value >= 8;
      const g = Math.floor(b.bl.tickStart / groupTicks);
      if (beamable && cur.length && g === curGroup) cur.push(b);
      else {
        if (cur.length) groups.push(cur);
        cur = beamable ? [b] : [];
        curGroup = g;
      }
    }
    if (cur.length) groups.push(cur);
    const beamed = new Set(groups.filter((g) => g.length > 1).flat().map((b) => b.bl.beat));

    for (const { bl, data } of beats) {
      if (data.notes.length === 0) continue;
      if (data.notes.some((n) => n.techniques.tremolo)) {
        // Tremolo picking: three short slashes across the stem.
        for (let k = 0; k < 3; k++) {
          const yy = top + layout.metrics.stemLen * 0.3 + k * 2.4 * u;
          ops.push({ t: 'line', x1: bl.x - 2.6 * u, y1: yy + 1.2 * u, x2: bl.x + 2.6 * u, y2: yy - 1.2 * u, w: 0.9 * u, c: 'ink' });
        }
      }
      const v = data.duration.value;
      if (v === 1) {
        if (data.duration.dotted) ops.push({ t: 'circle', cx: bl.x + 2.5 * u, cy: bottom - 1.5 * u, r: 0.9 * u, c: 'ink', fill: true });
        continue;
      }
      const stemTop = v === 2 ? top + layout.metrics.stemLen * 0.45 : top;
      ops.push({ t: 'line', x1: bl.x, y1: stemTop, x2: bl.x, y2: bottom, w: 0.8 * u, c: 'ink' });
      if (data.duration.dotted) ops.push({ t: 'circle', cx: bl.x + 2.8 * u, cy: bottom - 2 * u, r: 0.9 * u, c: 'ink', fill: true });
      if (v >= 8 && !beamed.has(bl.beat)) {
        const flags = v === 8 ? 1 : 2;
        for (let f = 0; f < flags; f++) {
          const fy = bottom - f * 3.2 * u;
          ops.push({ t: 'path', d: [['M', bl.x, fy], ['C', bl.x + 2 * u, fy - 1 * u, bl.x + 4.5 * u, fy - 2.5 * u, bl.x + 4 * u, fy - 5.5 * u]], c: 'ink', w: 0.9 * u });
        }
      }
    }
    for (const g of groups) {
      if (g.length < 2) continue;
      const x1 = g[0].bl.x;
      const x2 = g[g.length - 1].bl.x;
      ops.push({ t: 'rect', x: x1 - 0.4 * u, y: bottom - beamW, w: x2 - x1 + 0.8 * u, h: beamW, c: 'ink' });
      // Secondary beams for sixteenths.
      const y2 = bottom - beamW - 1.4 * u - beamW;
      g.forEach((b, i) => {
        if (b.data.duration.value < 16) return;
        const nextIs16 = g[i + 1] && g[i + 1].data.duration.value >= 16;
        const prevIs16 = g[i - 1] && g[i - 1].data.duration.value >= 16;
        if (nextIs16) ops.push({ t: 'rect', x: b.bl.x - 0.4 * u, y: y2, w: g[i + 1].bl.x - b.bl.x + 0.8 * u, h: beamW, c: 'ink' });
        else if (!prevIs16) {
          const stub = 4 * u;
          const toRight = i < g.length - 1;
          ops.push({ t: 'rect', x: toRight ? b.bl.x - 0.4 * u : b.bl.x - stub, y: y2, w: stub + 0.4 * u, h: beamW, c: 'ink' });
        }
      });
    }
  }
}
