import { useState } from 'react';
import { MagnifyingGlassMinus, MagnifyingGlassPlus, Plus } from '@phosphor-icons/react';
import type { Position, Song } from '../../model/types';
import { pitchClass } from '../../model/tuning';
import * as cmd from '../../editor/commands';
import type { EditorAction } from '../../editor/editor';
import { Button, Menu } from '../controls';
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from './Ribbon';

interface Props {
  song: Song;
  cursor: Position;
  dispatch: (a: EditorAction) => void;
  zoom: number;
  onZoom: (z: number) => void;
}

/** Bottom bar: track tabs (like spreadsheet sheets) on the left, position and zoom on the right. */
export function StatusBar({ song, cursor, dispatch, zoom, onZoom }: Props) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const track = song.tracks[cursor.track];
  const exec = (c: cmd.Command) => dispatch({ type: 'exec', command: c });

  const commitRename = () => {
    if (renaming !== null && draft.trim()) exec(cmd.renameTrack(renaming, draft));
    setRenaming(null);
  };

  return (
    <footer className="h-9 shrink-0 flex items-center gap-2 pl-1 pr-3 border-t border-line bg-bg100 text-xs">
      <div className="flex items-stretch h-full min-w-0" role="tablist" aria-label="Tracks">
        {song.tracks.map((t, i) => {
          const active = i === cursor.track;
          return renaming === i ? (
            <input
              key={t.id}
              autoFocus
              className="field h-7 my-1 w-32"
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              aria-label="Track name"
            />
          ) : (
            <Menu
              key={t.id}
              align="start"
              side="top"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (active ? toggle() : dispatch({ type: 'selectTrack', track: i }))}
                  onDoubleClick={() => (setRenaming(i), setDraft(t.name))}
                  data-tip={active ? 'Track options' : `Switch to ${t.name}`}
                  className={`relative h-full px-3 flex items-center gap-1.5 whitespace-nowrap transition-colors ${active ? 'bg-bg0 text-ink font-medium' : 'text-muted hover:text-ink hover:bg-bg200'}`}
                >
                  {active && <span className="absolute left-0 right-0 top-0 h-0.5 bg-accent" />}
                  {t.name}
                </button>
              )}
              items={[
                { label: 'Rename track', onSelect: () => (setRenaming(i), setDraft(t.name)) },
                {
                  label: 'Delete track',
                  danger: true,
                  onSelect: () => {
                    if (song.tracks.length <= 1) return window.alert('A song needs at least one track.');
                    if (!window.confirm(`Delete track "${t.name}"?`)) return;
                    exec(cmd.removeTrack(i));
                    dispatch({ type: 'selectTrack', track: Math.max(0, i - 1) });
                  },
                },
              ]}
            />
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          keepFocus
          className="self-center ml-1"
          tip="Add a track with the same tuning"
          onClick={() => {
            exec(cmd.addTrack(`Guitar ${song.tracks.length + 1}`));
            dispatch({ type: 'selectTrack', track: song.tracks.length });
          }}
        />
      </div>

      <div className="flex-1" />
      <span className="text-muted font-mono whitespace-nowrap" aria-live="polite">
        Bar {cursor.measure + 1}/{song.masterBars.length}, beat {cursor.beat + 1}, {pitchClass(track.instrument.tuning[cursor.string])} string
      </span>
      <div className="w-px h-4 bg-line mx-1" />
      <div className="flex items-center gap-1" role="group" aria-label="Zoom">
        <Button size="sm" variant="ghost" icon={MagnifyingGlassMinus} keepFocus disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clampZoom(zoom - 0.1))} tip="Zoom out" shortcut="Ctrl+-" />
        <input
          type="range"
          min={ZOOM_MIN * 100}
          max={ZOOM_MAX * 100}
          step={10}
          value={Math.round(zoom * 100)}
          onChange={(e) => onZoom(clampZoom(Number(e.target.value) / 100))}
          className="w-24 accent-[var(--accent)]"
          aria-label="Zoom level"
        />
        <Button size="sm" variant="ghost" icon={MagnifyingGlassPlus} keepFocus disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clampZoom(zoom + 0.1))} tip="Zoom in" shortcut="Ctrl+=" />
        <button type="button" className="font-mono text-muted hover:text-ink w-10 text-right" onClick={() => onZoom(1)} data-tip="Reset zoom" data-kbd="Ctrl+0">
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </footer>
  );
}
