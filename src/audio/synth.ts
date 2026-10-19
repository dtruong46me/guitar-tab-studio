/**
 * Guitar-like voices for Web Audio. Plucked strings use Karplus-Strong synthesis rendered into
 * cached AudioBuffers; harmonics, palm mutes and dead notes are variations of the same voice.
 */
import type { NoteEvent, Timbre } from './schedule';
import { midiToFrequency } from './schedule';

const BUFFER_SECONDS = 3;

/**
 * Renders one plucked string: a noise burst circulating in a damped, averaging delay line.
 * Returns the samples and the pitch they actually sound at (the delay is a whole number of
 * samples), so playback can correct tuning with playbackRate.
 */
export function renderPluck(sampleRate: number, frequency: number, seconds: number, opts: { decay: number; brightness: number }): { data: Float32Array; frequency: number } {
  const out = new Float32Array(Math.floor(sampleRate * seconds));
  // A two-point weighted average damps the string. At high pitches the string circulates so often
  // that an even average kills it within milliseconds, so the weighting lightens as pitch rises.
  // The filter adds `stretch` samples of delay, compensated in the returned frequency.
  const stretch = Math.max(0.12, Math.min(0.5, 0.5 - (frequency - 330) / 2600));
  const n = Math.max(2, Math.round(sampleRate / frequency - stretch));
  const line = new Float32Array(n);
  // Excitation: noise softened by a one-pole filter (a pick on a steel string is not white noise).
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += opts.brightness * (Math.random() * 2 - 1 - lp);
    line[i] = lp;
  }
  let idx = 0;
  for (let i = 0; i < out.length; i++) {
    const next = idx + 1 === n ? 0 : idx + 1;
    out[i] = line[idx];
    line[idx] = opts.decay * ((1 - stretch) * line[idx] + stretch * line[next]);
    idx = next;
  }
  // Normalise so loud and quiet strings start at a similar level.
  let peak = 0;
  for (let i = 0; i < Math.min(out.length, 4096); i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return { data: out, frequency: sampleRate / (n + stretch) };
}

export class GuitarSynth {
  private cache = new Map<string, { buffer: AudioBuffer; rate: number }>();
  readonly output: GainNode;
  private body: BiquadFilterNode;

  constructor(private ctx: BaseAudioContext, destination: AudioNode) {
    // A gentle body resonance and a compressor glue the voices into one instrument.
    this.body = ctx.createBiquadFilter();
    this.body.type = 'peaking';
    this.body.frequency.value = 180;
    this.body.Q.value = 1.1;
    this.body.gain.value = 4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.output = ctx.createGain();
    this.output.gain.value = 0.55;
    this.body.connect(comp).connect(this.output).connect(destination);
  }

  private voice(midi: number, timbre: Timbre): { buffer: AudioBuffer; rate: number } {
    const key = `${timbre}:${midi}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const sr = this.ctx.sampleRate;
    const freq = midiToFrequency(midi);
    let data: Float32Array;
    let actual = freq;
    if (timbre === 'harmonic') {
      // Bell-like: mostly fundamental with a soft octave, slow decay.
      data = new Float32Array(Math.floor(sr * BUFFER_SECONDS));
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        data[i] = (Math.sin(2 * Math.PI * freq * t) + 0.25 * Math.sin(4 * Math.PI * freq * t)) * Math.exp(-t * 1.6) * 0.8;
      }
    } else {
      // Higher strings decay faster, like a real guitar; muted and dead notes die quickly.
      const decay = timbre === 'dead' ? 0.9 : timbre === 'muted' ? 0.985 : Math.min(0.9985, 0.9995 - (midi - 40) * 0.000012);
      const r = renderPluck(sr, freq, timbre === 'dead' ? 0.15 : BUFFER_SECONDS, { decay, brightness: timbre === 'muted' ? 0.25 : 0.55 });
      data = r.data;
      actual = r.frequency;
    }
    const buffer = this.ctx.createBuffer(1, data.length, sr);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    const voice = { buffer, rate: freq / actual };
    this.cache.set(key, voice);
    return voice;
  }

  /** Schedule one note at an absolute AudioContext time. Returns the source so it can be stopped. */
  play(ev: NoteEvent, at: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    const voice = this.voice(ev.midi, ev.timbre);
    src.buffer = voice.buffer;
    src.playbackRate.value = voice.rate;
    const amp = this.ctx.createGain();
    const release = ev.timbre === 'dead' ? 0.02 : 0.06;
    amp.gain.setValueAtTime(ev.gain, at);
    amp.gain.setValueAtTime(ev.gain, at + ev.duration);
    amp.gain.linearRampToValueAtTime(0, at + ev.duration + release);

    let node: AudioNode = amp;
    if (ev.timbre === 'muted') {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      amp.connect(lp);
      node = lp;
    }
    if (ev.pitchCurve) {
      for (const [offset, cents] of ev.pitchCurve) {
        if (offset === 0) src.detune.setValueAtTime(cents, at);
        else src.detune.linearRampToValueAtTime(cents, at + offset);
      }
    }
    if (ev.vibrato) {
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 22;
      lfo.connect(depth).connect(src.detune);
      lfo.start(at + Math.min(0.08, ev.duration / 3));
      lfo.stop(at + ev.duration + release);
    }
    src.connect(amp);
    node.connect(this.body);
    src.start(at);
    src.stop(at + Math.min(ev.duration + release, voice.buffer.duration / voice.rate));
    return src;
  }

  /** Metronome tick: a short pitched blip, higher on the downbeat. */
  click(at: number, accent: boolean, destination: AudioNode = this.ctx.destination): OscillatorNode {
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, at + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(amp).connect(destination);
    osc.start(at);
    osc.stop(at + 0.06);
    return osc;
  }
}
