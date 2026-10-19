import { useCallback, useEffect, useState } from 'react';
import { isDirty } from '../editor/editor';
import { keyToIntent, type AppCommand } from '../editor/keymap';
import { BottomPanel, clampZoom, ZOOM_STEP } from './BottomPanel';
import { HelpDialog } from './HelpDialog';
import { LeftSidebar } from './LeftSidebar';
import { PrintPreview } from './PrintPreview';
import { ProjectsDialog } from './ProjectsDialog';
import { RightSidebar } from './RightSidebar';
import { TabCanvas } from './TabCanvas';
import { Toolbar } from './Toolbar';
import { useStudio } from './useStudio';

type Dialog = 'print' | 'projects' | 'help' | null;

function loadPref<T extends string | number>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return (typeof fallback === 'number' ? Number(v) : v) as T;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* preferences are optional */
  }
}

/** Focus is in a text control: let it handle keys itself. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function App() {
  const studio = useStudio();
  const { state, dispatch } = studio;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [zoom, setZoom] = useState(() => clampZoom(loadPref('gts:zoom', 1)) || 1);
  const [theme, setTheme] = useState<'studio' | 'paper'>(() => (loadPref<string>('gts:theme', 'studio') === 'paper' ? 'paper' : 'studio'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePref('gts:theme', theme);
  }, [theme]);
  useEffect(() => savePref('gts:zoom', zoom), [zoom]);
  useEffect(() => {
    document.title = `${isDirty(state) ? '• ' : ''}${state.song.meta.title || 'Untitled'} — Guitar Tab Studio`;
  }, [state]);

  const runApp = useCallback(
    (command: AppCommand) => {
      switch (command) {
        case 'save':
          void studio.save();
          break;
        case 'exportPdf':
          setDialog('print');
          break;
        case 'help':
          setDialog('help');
          break;
        case 'zoomIn':
          setZoom((z) => clampZoom(z + ZOOM_STEP));
          break;
        case 'zoomOut':
          setZoom((z) => clampZoom(z - ZOOM_STEP));
          break;
        case 'zoomReset':
          setZoom(1);
          break;
      }
    },
    [studio],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const intent = keyToIntent(e);
      if (!intent) return;
      const typing = isTyping(e.target);
      // While typing in a field or with a dialog open, only Save stays global.
      if ((typing || dialog) && !(intent.kind === 'app' && intent.command === 'save')) return;
      e.preventDefault();
      if (intent.kind === 'app') runApp(intent.command);
      else dispatch(intent.action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, dispatch, runApp]);

  const close = useCallback(() => setDialog(null), []);

  return (
    <div className="h-full flex flex-col text-ink">
      <Toolbar
        song={state.song}
        track={state.cursor.track}
        history={state.history}
        dirty={isDirty(state)}
        dispatch={dispatch}
        onSave={() => void studio.save()}
        onExport={() => setDialog('print')}
        onProjects={() => setDialog('projects')}
      />
      <div className="flex-1 min-h-0 flex">
        <LeftSidebar song={state.song} track={state.cursor.track} dispatch={dispatch} />
        <main className="flex-1 min-w-0 bg-bg0" aria-label="Tablature">
          {studio.ready && <TabCanvas song={state.song} cursor={state.cursor} zoom={zoom} onCursor={(pos) => dispatch({ type: 'setCursor', pos })} />}
        </main>
        <RightSidebar song={state.song} cursor={state.cursor} dispatch={dispatch} />
      </div>
      <BottomPanel
        song={state.song}
        cursor={state.cursor}
        zoom={zoom}
        theme={theme}
        onZoom={setZoom}
        onTheme={() => setTheme((t) => (t === 'studio' ? 'paper' : 'studio'))}
        onHelp={() => setDialog('help')}
      />

      {dialog === 'print' && (
        <PrintPreview song={state.song} track={state.cursor.track} onClose={close} onExported={(name) => studio.notify(`Exported ${name}.`)} onError={(m) => studio.notify(m, 'error')} />
      )}
      {dialog === 'projects' && <ProjectsDialog studio={studio} onClose={close} />}
      {dialog === 'help' && <HelpDialog onClose={close} />}

      {studio.toast && (
        <div
          role="status"
          className={`fixed bottom-14 left-1/2 -translate-x-1/2 z-[60] px-3 py-2 rounded-md border text-[13px] shadow-lg bg-bg200 ${studio.toast.tone === 'error' ? 'border-danger text-danger' : 'border-line text-ink'}`}
        >
          {studio.toast.text}
        </div>
      )}
    </div>
  );
}
