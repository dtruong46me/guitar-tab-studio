import { ArrowClockwise, ArrowCounterClockwise, CheckCircle, CircleNotch, FilePdf, House, Keyboard, Metronome, Pause, Play, Repeat, Stop, WarningCircle } from '@phosphor-icons/react';
import type { Song } from '../../model/types';
import * as cmd from '../../editor/commands';
import type { EditorAction } from '../../editor/editor';
import { canRedo, canUndo, type History } from '../../editor/history';
import type { TransportState } from '../../audio/engine';
import { Button, Divider } from '../controls';
import type { SaveState } from './useEditorSession';
import { formatClock, type PlaybackSettings } from './usePlayback';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

interface Props {
  song: Song;
  history: History;
  saveState: SaveState;
  dispatch: (a: EditorAction) => void;
  onHome: () => void;
  onExport: () => void;
  onShortcuts: () => void;
  transport: TransportState;
  settings: PlaybackSettings;
  clock: { time: number; duration: number };
  onToggle: () => void;
  onStop: () => void;
  onSettings: (p: Partial<PlaybackSettings>) => void;
}

/** Top bar of the editor: document identity on the left, transport in the middle, output on the right. */
export function TitleBar(p: Props) {
  const { song, history, dispatch } = p;
  const lastUndo = history.past[history.past.length - 1];
  const lastRedo = history.future[history.future.length - 1];
  const playing = p.transport === 'playing';

  return (
    <header className="h-12 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 border-b border-line bg-bg100">
      <div className="flex items-center gap-1 min-w-0">
        <Button variant="ghost" icon={House} onClick={p.onHome} tip="Back to your tabs">
          Home
        </Button>
        <Divider />
        <input
          className="field min-w-0 w-full max-w-[280px] bg-transparent border-transparent text-[14px] font-semibold"
          value={song.meta.title}
          placeholder="Untitled"
          onChange={(e) => dispatch({ type: 'exec', command: cmd.setMeta({ title: e.target.value }) })}
          aria-label="Tab title"
          data-tip="Rename this tab"
          maxLength={120}
        />
        <SaveBadge state={p.saveState} />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-line bg-bg0 px-1 py-0.5" role="group" aria-label="Playback">
        <Button
          variant={playing ? 'default' : 'primary'}
          icon={playing ? Pause : Play}
          keepFocus
          onClick={p.onToggle}
          tip={playing ? 'Pause' : 'Play from the selected measure'}
          shortcut="Space"
        />
        <Button variant="ghost" icon={Stop} keepFocus onClick={p.onStop} disabled={p.transport === 'stopped'} tip="Stop" shortcut="Shift+Space" />
        <span className="font-mono text-xs text-muted w-[84px] text-center tabular-nums" aria-live="off">
          {formatClock(p.clock.time)} / {formatClock(p.clock.duration)}
        </span>
        <Button variant="ghost" icon={Repeat} keepFocus pressed={p.settings.loop} onClick={() => p.onSettings({ loop: !p.settings.loop })} tip="Loop: repeat from where playback started" />
        <Button variant="ghost" icon={Metronome} keepFocus pressed={p.settings.metronome} onClick={() => p.onSettings({ metronome: !p.settings.metronome })} tip="Metronome click" shortcut="M" />
        <select
          className="field h-6 border-transparent bg-transparent font-mono text-xs"
          value={p.settings.speed}
          onChange={(e) => p.onSettings({ speed: Number(e.target.value) })}
          aria-label="Playback speed"
          data-tip={`Practice speed (written tempo ${song.tempo} BPM)`}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {Math.round(s * 100)}%
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" icon={ArrowCounterClockwise} keepFocus disabled={!canUndo(history)} onClick={() => dispatch({ type: 'undo' })} tip={lastUndo ? `Undo ${lastUndo.label.toLowerCase()}` : 'Undo'} shortcut="Ctrl+Z" />
        <Button variant="ghost" icon={ArrowClockwise} keepFocus disabled={!canRedo(history)} onClick={() => dispatch({ type: 'redo' })} tip={lastRedo ? `Redo ${lastRedo.label.toLowerCase()}` : 'Redo'} shortcut="Ctrl+Shift+Z" />
        <Button variant="ghost" icon={Keyboard} keepFocus onClick={p.onShortcuts} tip="Keyboard shortcuts" shortcut="?" />
        <Divider />
        <Button variant="primary" icon={FilePdf} onClick={p.onExport} tip="Print preview and PDF download" shortcut="Ctrl+P">
          Export PDF
        </Button>
      </div>
    </header>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    saved: { icon: CheckCircle, text: 'Saved', cls: 'text-muted', tip: 'All changes are saved in this browser' },
    pending: { icon: CircleNotch, text: 'Saving', cls: 'text-muted', tip: 'Changes save automatically' },
    saving: { icon: CircleNotch, text: 'Saving', cls: 'text-muted', tip: 'Saving to this browser' },
    error: { icon: WarningCircle, text: 'Not saved', cls: 'text-danger', tip: 'Browser storage is unavailable. Export JSON from the home screen to keep a copy.' },
  }[state];
  const IconCmp = map.icon;
  return (
    <span className={`flex items-center gap-1 text-[11px] whitespace-nowrap ${map.cls}`} data-tip={map.tip} aria-live="polite">
      <IconCmp size={14} className={state === 'saving' || state === 'pending' ? 'motion-safe:animate-spin [animation-duration:1.4s]' : ''} aria-hidden />
      {map.text}
    </span>
  );
}
