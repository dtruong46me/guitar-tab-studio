import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../model/types';
import { loadProject } from '../io/storage';
import { Toast, TooltipLayer } from './controls';
import { EditorScreen } from './editor/EditorScreen';
import { HomeScreen } from './home/HomeScreen';
import { useTheme } from './theme';

/** Routes: "#/" is the library, "#/tab/<id>" the editor. The hash keeps Back/Forward working. */
type Route = { name: 'home' } | { name: 'tab'; id: string };

function parseHash(): Route {
  const m = /^#\/tab\/([\w-]+)$/.exec(window.location.hash);
  return m ? { name: 'tab', id: m[1] } : { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [theme, setTheme] = useTheme();
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error'; id: number } | null>(null);
  // The song being edited and whether it already exists in storage.
  const [open, setOpen] = useState<{ song: Song; saved: boolean } | null>(null);
  const pendingNew = useRef<Song | null>(null);

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => setToast({ text, tone, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Resolve the song for the current route.
  useEffect(() => {
    if (route.name !== 'tab') {
      setOpen(null);
      document.title = 'Guitar Tab Studio';
      return;
    }
    if (open?.song.id === route.id) return;
    if (pendingNew.current?.id === route.id) {
      setOpen({ song: pendingNew.current, saved: false });
      pendingNew.current = null;
      return;
    }
    let cancelled = false;
    loadProject(route.id)
      .then((song) => {
        if (cancelled) return;
        if (song) setOpen({ song, saved: true });
        else {
          notify('That tab was not found. It may never have been edited, or it was deleted.', 'error');
          window.location.hash = '#/';
        }
      })
      .catch(() => {
        notify('Browser storage is unavailable.', 'error');
        window.location.hash = '#/';
      });
    return () => {
      cancelled = true;
    };
  }, [route, open, notify]);

  const openSong = useCallback((song: Song) => {
    setOpen({ song, saved: true });
    window.location.hash = `#/tab/${song.id}`;
  }, []);

  const createSong = useCallback((song: Song) => {
    pendingNew.current = song;
    setOpen({ song, saved: false });
    window.location.hash = `#/tab/${song.id}`;
  }, []);

  return (
    <div className="h-full text-ink">
      {route.name === 'home' && <HomeScreen onOpen={openSong} onCreate={createSong} notify={notify} theme={theme} onTheme={setTheme} />}
      {route.name === 'tab' && open && open.song.id === route.id && (
        <EditorScreen key={open.song.id} song={open.song} saved={open.saved} onHome={() => (window.location.hash = '#/')} notify={notify} theme={theme} onTheme={setTheme} />
      )}
      <TooltipLayer />
      {toast && <Toast key={toast.id} text={toast.text} tone={toast.tone} />}
    </div>
  );
}
