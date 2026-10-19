import type { Position, Song } from '../model/types';
import { Icon } from './icons';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const clampZoom = (z: number) => Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;

interface Props {
  song: Song;
  cursor: Position;
  zoom: number;
  theme: 'studio' | 'paper';
  onZoom: (z: number) => void;
  onTheme: () => void;
  onHelp: () => void;
}

export function BottomPanel({ song, cursor, zoom, theme, onZoom, onTheme, onHelp }: Props) {
  const measures = song.masterBars.length;
  const beats = song.tracks[cursor.track].measures.reduce((n, m) => n + m.beats.filter((b) => b.notes.length).length, 0);
  return (
    <footer className="h-10 shrink-0 flex items-center gap-3 px-3 border-t border-line bg-bg100 text-xs">
      <span className="text-muted font-mono" aria-live="polite">
        Bar {cursor.measure + 1}/{measures} · Beat {cursor.beat + 1} · String {cursor.string + 1}
      </span>
      <span className="text-muted">
        {song.tracks[cursor.track].name} · {beats} note {beats === 1 ? 'beat' : 'beats'}
      </span>
      <div className="flex-1" />
      <button className="btn btn-ghost btn-icon" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
        {Icon.help}
      </button>
      <button className="btn btn-ghost btn-icon" onClick={onTheme} title={theme === 'studio' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle theme">
        {theme === 'studio' ? Icon.sun : Icon.moon}
      </button>
      <div className="h-5 w-px bg-line" />
      <div className="flex items-center gap-1" role="group" aria-label="Zoom">
        <button className="btn btn-ghost btn-icon" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))} title="Zoom out (Ctrl+−)" aria-label="Zoom out">
          {Icon.minus}
        </button>
        <input
          type="range"
          min={ZOOM_MIN * 100}
          max={ZOOM_MAX * 100}
          step={ZOOM_STEP * 100}
          value={Math.round(zoom * 100)}
          onChange={(e) => onZoom(clampZoom(Number(e.target.value) / 100))}
          className="w-28 accent-[var(--accent)]"
          aria-label="Zoom level"
        />
        <button className="btn btn-ghost btn-icon" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))} title="Zoom in (Ctrl+=)" aria-label="Zoom in">
          {Icon.plus}
        </button>
        <button className="btn btn-ghost font-mono w-14 justify-center" onClick={() => onZoom(1)} title="Reset zoom (Ctrl+0)">
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </footer>
  );
}
