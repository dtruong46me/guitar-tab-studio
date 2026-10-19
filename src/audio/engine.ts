/**
 * Transport: plays a Schedule through the GuitarSynth with a look-ahead scheduler (events are
 * queued slightly ahead of time on the audio clock, so timing never depends on UI frame rate).
 */
import type { Song } from '../model/types';
import { beatAt, buildSchedule, type Schedule } from './schedule';
import { GuitarSynth } from './synth';

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface PlayOptions {
  tracks: number[];
  cursorTrack: number;
  startMeasure: number;
  speed: number;
  loop: boolean;
  metronome: boolean;
}

export interface PlayheadPosition {
  measure: number;
  beat: number;
}

const LOOKAHEAD = 0.15;
const TICK_MS = 30;
const START_DELAY = 0.08;

type Listener = () => void;

export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private synth: GuitarSynth | null = null;
  private schedule: Schedule | null = null;
  private opts: PlayOptions | null = null;
  private timer: number | null = null;
  private nextEvent = 0;
  private nextClick = 0;
  /** AudioContext time at which schedule time 0 of the current loop pass plays. */
  private origin = 0;
  /** Schedule time where playback resumes after a pause. */
  private pausedAt = 0;
  private active = new Set<AudioScheduledSourceNode>();
  private listeners = new Set<Listener>();
  state: TransportState = 'stopped';
  metronome = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.synth = new GuitarSynth(this.ctx, this.ctx.destination);
    }
    return this.ctx;
  }

  play(song: Song, opts: PlayOptions) {
    const ctx = this.ensureContext();
    void ctx.resume();
    const resuming = this.state === 'paused' && this.opts && this.opts.startMeasure === opts.startMeasure;
    this.silence();
    this.schedule = buildSchedule(song, opts);
    this.metronome = opts.metronome;
    // Paused positions are in schedule seconds; rescale them if the speed changed meanwhile.
    const from = resuming && this.opts ? (this.pausedAt * this.opts.speed) / opts.speed : 0;
    this.opts = opts;
    this.origin = ctx.currentTime + START_DELAY - from;
    this.nextEvent = this.schedule.events.findIndex((e) => e.time >= from - 1e-6);
    if (this.nextEvent < 0) this.nextEvent = this.schedule.events.length;
    this.nextClick = this.schedule.clicks.findIndex((c) => c.time >= from - 1e-6);
    if (this.nextClick < 0) this.nextClick = this.schedule.clicks.length;
    this.state = 'playing';
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
  }

  pause() {
    if (this.state !== 'playing' || !this.ctx) return;
    this.pausedAt = Math.max(0, this.ctx.currentTime - this.origin);
    this.silence();
    this.state = 'paused';
    this.emit();
  }

  stop() {
    this.silence();
    this.pausedAt = 0;
    this.state = 'stopped';
    this.schedule = null;
    this.emit();
  }

  setLoop(loop: boolean) {
    if (this.opts) this.opts = { ...this.opts, loop };
  }

  setMetronome(on: boolean) {
    this.metronome = on;
  }

  /** Current playhead (beat of the cursor track), or null when nothing is playing. */
  position(): PlayheadPosition | null {
    if (!this.schedule || !this.ctx || this.state === 'stopped') return null;
    const t = this.state === 'paused' ? this.pausedAt : this.ctx.currentTime - this.origin;
    const i = beatAt(this.schedule.beats, Math.max(0, t));
    const b = this.schedule.beats[Math.max(0, i)];
    return b ? { measure: b.measure, beat: b.beat } : null;
  }

  /** Seconds played and total, for the time display. */
  progress(): { time: number; duration: number } {
    if (!this.schedule || !this.ctx) return { time: 0, duration: 0 };
    const t = this.state === 'paused' ? this.pausedAt : this.ctx.currentTime - this.origin;
    return { time: Math.max(0, Math.min(t, this.schedule.duration)), duration: this.schedule.duration };
  }

  private tick() {
    const ctx = this.ctx;
    const sched = this.schedule;
    const synth = this.synth;
    if (!ctx || !sched || !synth || this.state !== 'playing') return;
    const horizon = ctx.currentTime + LOOKAHEAD;

    while (this.nextEvent < sched.events.length && this.origin + sched.events[this.nextEvent].time < horizon) {
      const ev = sched.events[this.nextEvent++];
      const at = Math.max(ctx.currentTime, this.origin + ev.time);
      this.track(synth.play(ev, at));
    }
    while (this.nextClick < sched.clicks.length && this.origin + sched.clicks[this.nextClick].time < horizon) {
      const c = sched.clicks[this.nextClick++];
      if (this.metronome) this.track(synth.click(Math.max(ctx.currentTime, this.origin + c.time), c.accent));
    }

    const end = this.origin + sched.duration;
    if (this.nextEvent >= sched.events.length && this.nextClick >= sched.clicks.length && horizon >= end) {
      if (this.opts?.loop && sched.duration > 0) {
        this.origin = end;
        this.nextEvent = 0;
        this.nextClick = 0;
      } else if (ctx.currentTime >= end + 0.3) {
        this.stop();
      }
    }
  }

  private track(node: AudioScheduledSourceNode) {
    this.active.add(node);
    node.onended = () => this.active.delete(node);
  }

  private silence() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const n of this.active) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active.clear();
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.listeners.clear();
  }
}
