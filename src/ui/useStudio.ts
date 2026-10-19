/** App controller: editor reducer + persistence + file import/export, exposed to the UI. */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Song } from '../model/types';
import { createSong, cloneSongWithNewIds } from '../model/factory';
import { createDemoSong } from '../model/demo';
import { createEditorState, editorReducer, isDirty, type EditorAction } from '../editor/editor';
import { setMeta } from '../editor/commands';
import { parseProject, serializeProject } from '../io/json';
import * as storage from '../io/storage';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(song: Song, ext: string): string {
  return `${(song.meta.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim() || 'tab'}.${ext}`;
}

export function useStudio() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createDemoSong(), true));
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (state.status) notify(state.status);
  }, [state.status, notify]);

  // Open the last project on start.
  useEffect(() => {
    const id = storage.lastProjectId();
    if (!id) {
      setReady(true);
      return;
    }
    storage
      .loadProject(id)
      .then((song) => {
        if (song) dispatch({ type: 'load', song, saved: true });
      })
      .catch(() => notify('Could not open the last project; local storage is unavailable.', 'error'))
      .finally(() => setReady(true));
  }, [notify]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty(stateRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const confirmDiscard = useCallback(() => !isDirty(stateRef.current) || window.confirm('You have unsaved changes. Discard them?'), []);

  const save = useCallback(async () => {
    const song = stateRef.current.song;
    try {
      await storage.saveProject(song);
      storage.rememberLastProject(song.id);
      dispatch({ type: 'markSaved', song });
      notify('Saved.');
      return true;
    } catch {
      notify('Saving failed: browser storage is unavailable. Export as JSON instead.', 'error');
      return false;
    }
  }, [notify]);

  const open = useCallback(
    async (id: string) => {
      if (!confirmDiscard()) return;
      const song = await storage.loadProject(id);
      if (!song) return notify('That project no longer exists.', 'error');
      dispatch({ type: 'load', song, saved: true });
      storage.rememberLastProject(id);
    },
    [confirmDiscard, notify],
  );

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    dispatch({ type: 'load', song: createSong('Untitled', 4), saved: false });
  }, [confirmDiscard]);

  const duplicate = useCallback(
    async (id?: string) => {
      const source = id ? await storage.loadProject(id) : stateRef.current.song;
      if (!source) return;
      const copy = cloneSongWithNewIds(source);
      copy.meta = { ...copy.meta, title: `${copy.meta.title} (copy)` };
      await storage.saveProject(copy);
      notify(`Duplicated as "${copy.meta.title}".`);
    },
    [notify],
  );

  const remove = useCallback(
    async (id: string) => {
      await storage.deleteProject(id);
      if (id === stateRef.current.song.id) {
        dispatch({ type: 'load', song: createSong('Untitled', 4), saved: false });
      }
      notify('Project deleted.');
    },
    [notify],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      const name = title.trim();
      if (!name) return;
      if (id === stateRef.current.song.id) {
        dispatch({ type: 'exec', command: setMeta({ title: name }) });
      }
      const song = await storage.loadProject(id);
      if (song) await storage.saveProject({ ...song, meta: { ...song.meta, title: name } });
    },
    [],
  );

  const exportJson = useCallback(() => {
    const song = stateRef.current.song;
    downloadBlob(new Blob([serializeProject(song)], { type: 'application/json' }), safeFileName(song, 'gts.json'));
  }, []);

  const importJson = useCallback(
    async (file: File) => {
      if (file.size > 20 * 1024 * 1024) return notify('That file is too large to be a project.', 'error');
      const result = parseProject(await file.text());
      if (!result.ok) return notify(`Import failed: ${result.error}`, 'error');
      if (!confirmDiscard()) return;
      // Imported projects get a fresh id so they never overwrite an existing local project.
      const song = cloneSongWithNewIds(result.song);
      dispatch({ type: 'load', song, saved: false });
      notify(result.warnings.length ? `Imported with warnings: ${result.warnings.join(' ')}` : `Imported "${song.meta.title}".`);
    },
    [confirmDiscard, notify],
  );

  const run = useCallback((action: EditorAction) => dispatch(action), []);

  return { state, dispatch: run, ready, toast, notify, save, open, newProject, duplicate, remove, rename, exportJson, importJson };
}

export type Studio = ReturnType<typeof useStudio>;
