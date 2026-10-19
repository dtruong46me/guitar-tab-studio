import { useCallback, useEffect, useState } from 'react';
import type { Song } from '../../model/types';
import * as cmd from '../../editor/commands';
import { keyToIntent, type AppCommand } from '../../editor/keymap';
import { HelpDialog } from '../HelpDialog';
import { PrintPreview } from '../PrintPreview';
import { TabCanvas } from '../TabCanvas';
import type { Theme } from '../theme';
import { clampZoom, Ribbon } from './Ribbon';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { TuningDialog } from './TuningDialog';
import { useEditorSession } from './useEditorSession';
import { usePlayback } from './usePlayback';

type Dialog = 'print' | 'help' | 'tuning' | null;

interface Props {
  song: Song;
  saved: boolean;
  onHome: () => void;
  notify: (text: string, tone?: 'info' | 'error') => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
}

function initialZoom(): number {
  try {
    return clampZoom(Number(localStorage.getItem('gts:zoom')) || 1);
  } catch {
    return 1;
  }
}

/** Focus is in a text control: let it handle keys itself. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function EditorScreen({ song: initial, saved, onHome, notify, theme, onTheme }: Props) {
  const { state, dispatch, save, saveState, untouched } = useEditorSession(initial, saved);
  const playback = usePlayback(state.song, state.cursor);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [zoom, setZoomState] = useState(initialZoom);

  const setZoom = useCallback((z: number) => {
    setZoomState(z);
    try {
      localStorage.setItem('gts:zoom', String(z));
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    if (state.status) notify(state.status);
  }, [state.status, notify]);

  useEffect(() => {
    document.title = `${state.song.meta.title || 'Untitled'} - Guitar Tab Studio`;
  }, [state.song.meta.title]);

  const togglePlay = useCallback(() => {
    if (playback.state === 'playing') {
      playback.pause();
      // Leave the cursor where the music stopped, so editing continues from there.
      if (playback.playhead) dispatch({ type: 'setCursor', pos: { ...state.cursor, ...playback.playhead } });
    } else playback.play();
  }, [playback, dispatch, state.cursor]);

  const goHome = useCallback(async () => {
    playback.stop();
    if (!untouched && !(await save()) && !window.confirm('This tab could not be saved. Leave anyway?')) return;
    onHome();
  }, [playback, untouched, save, onHome]);

  const runApp = useCallback(
    (c: AppCommand) => {
      switch (c) {
        case 'save':
          void save().then((ok) => notify(ok ? 'Saved.' : 'Saving failed: browser storage is unavailable.', ok ? 'info' : 'error'));
          break;
        case 'exportPdf':
          playback.stop();
          setDialog('print');
          break;
        case 'help':
          setDialog('help');
          break;
        case 'zoomIn':
          setZoom(clampZoom(zoom + 0.1));
          break;
        case 'zoomOut':
          setZoom(clampZoom(zoom - 0.1));
          break;
        case 'zoomReset':
          setZoom(1);
          break;
        case 'playPause':
          togglePlay();
          break;
        case 'stop':
          playback.stop();
          break;
        case 'metronome':
          playback.update({ metronome: !playback.settings.metronome });
          break;
      }
    },
    [save, notify, playback, zoom, setZoom, togglePlay],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const intent = keyToIntent(e);
      if (!intent) return;
      const typing = isTyping(e.target);
      // In text fields and dialogs only Save stays global; everything else belongs to the field.
      if ((typing || dialog) && !(intent.kind === 'app' && intent.command === 'save')) return;
      e.preventDefault();
      if (intent.kind === 'app') runApp(intent.command);
      else dispatch(intent.action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, dispatch, runApp]);

  const close = useCallback(() => setDialog(null), []);
  const track = state.song.tracks[state.cursor.track];

  return (
    <div className="h-full flex flex-col screen-in">
      <TitleBar
        song={state.song}
        history={state.history}
        saveState={saveState}
        dispatch={dispatch}
        onHome={() => void goHome()}
        onExport={() => runApp('exportPdf')}
        onShortcuts={() => setDialog('help')}
        transport={playback.state}
        settings={playback.settings}
        clock={playback.clock}
        onToggle={togglePlay}
        onStop={playback.stop}
        onSettings={playback.update}
      />
      <Ribbon
        song={state.song}
        cursor={state.cursor}
        dispatch={dispatch}
        zoom={zoom}
        onZoom={setZoom}
        theme={theme}
        onTheme={onTheme}
        onShortcuts={() => setDialog('help')}
        onEditTuning={() => setDialog('tuning')}
      />
      <main className="flex-1 min-h-0 bg-bg0" aria-label="Tablature">
        <TabCanvas song={state.song} cursor={state.cursor} zoom={zoom} playhead={playback.state === 'stopped' ? null : playback.playhead} onCursor={(pos) => dispatch({ type: 'setCursor', pos })} />
      </main>
      <StatusBar song={state.song} cursor={state.cursor} dispatch={dispatch} zoom={zoom} onZoom={setZoom} />

      {dialog === 'print' && (
        <PrintPreview song={state.song} track={state.cursor.track} onClose={close} onExported={(name) => notify(`Downloaded ${name}.`)} onError={(m) => notify(m, 'error')} />
      )}
      {dialog === 'help' && <HelpDialog onClose={close} />}
      {dialog === 'tuning' && <TuningDialog tuning={track.instrument.tuning} onClose={close} onApply={(t) => dispatch({ type: 'exec', command: cmd.setTuning(state.cursor.track, t) })} />}
    </div>
  );
}
