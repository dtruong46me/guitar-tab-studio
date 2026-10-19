/** React binding for the playback engine: transport state, options and a beat-accurate playhead. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Song } from '../../model/types';
import { PlaybackEngine, type PlayheadPosition } from '../../audio/engine';

export interface PlaybackSettings {
  loop: boolean;
  metronome: boolean;
  speed: number;
}

export function usePlayback(song: Song, cursor: { track: number; measure: number }) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  if (!engineRef.current) engineRef.current = new PlaybackEngine();
  const engine = engineRef.current;
  const state = useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.state,
  );
  const [settings, setSettings] = useState<PlaybackSettings>({ loop: false, metronome: false, speed: 1 });
  const [playhead, setPlayhead] = useState<PlayheadPosition | null>(null);
  const [clock, setClock] = useState({ time: 0, duration: 0 });

  useEffect(() => () => engine.dispose(), [engine]);

  // Follow the audio clock once per frame, but only re-render when the beat or second changes.
  useEffect(() => {
    if (state !== 'playing') {
      setPlayhead(engine.position());
      setClock(engine.progress());
      return;
    }
    let raf = 0;
    let lastKey = '';
    let lastSec = -1;
    const loop = () => {
      const pos = engine.position();
      const key = pos ? `${pos.measure}:${pos.beat}` : '';
      if (key !== lastKey) {
        lastKey = key;
        setPlayhead(pos);
      }
      const p = engine.progress();
      const sec = Math.floor(p.time);
      if (sec !== lastSec) {
        lastSec = sec;
        setClock(p);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, engine]);

  const songRef = useRef(song);
  songRef.current = song;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Where the current play run started, so Pause → Play resumes instead of restarting.
  const startMeasure = useRef(0);

  const play = useCallback(() => {
    const s = songRef.current;
    if (engine.state !== 'paused') startMeasure.current = cursorRef.current.measure;
    engine.play(s, {
      tracks: s.tracks.map((_, i) => i),
      cursorTrack: cursorRef.current.track,
      startMeasure: startMeasure.current,
      speed: settingsRef.current.speed,
      loop: settingsRef.current.loop,
      metronome: settingsRef.current.metronome,
    });
  }, [engine]);

  const pause = useCallback(() => engine.pause(), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const toggle = useCallback(() => (engine.state === 'playing' ? engine.pause() : play()), [engine, play]);

  const update = useCallback(
    (patch: Partial<PlaybackSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.loop !== undefined) engine.setLoop(next.loop);
        if (patch.metronome !== undefined) engine.setMetronome(next.metronome);
        return next;
      });
      // Speed changes the schedule, so restart from the same place.
      if (patch.speed !== undefined && engine.state === 'playing') {
        settingsRef.current = { ...settingsRef.current, ...patch };
        engine.pause();
        play();
      }
    },
    [engine, play],
  );

  return { state, settings, update, play, pause, stop, toggle, playhead, clock };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
