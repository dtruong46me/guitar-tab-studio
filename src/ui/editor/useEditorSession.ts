/** Editor session for one song: the editing state machine plus debounced autosave to IndexedDB. */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Song } from '../../model/types';
import { createEditorState, editorReducer, isDirty } from '../../editor/editor';
import { saveProject } from '../../io/storage';

export type SaveState = 'saved' | 'saving' | 'pending' | 'error';

const AUTOSAVE_MS = 700;

export function useEditorSession(initial: Song, alreadySaved: boolean) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(initial, alreadySaved));
  const [saveState, setSaveState] = useState<SaveState>(alreadySaved ? 'saved' : 'pending');
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<number | undefined>(undefined);

  const save = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    const song = stateRef.current.song;
    if (!isDirty(stateRef.current)) return true;
    setSaveState('saving');
    try {
      await saveProject(song);
      dispatch({ type: 'markSaved', song });
      setSaveState(stateRef.current.song === song ? 'saved' : 'pending');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, []);

  // Autosave shortly after edits. A brand-new, untouched tab is not saved (no empty clutter).
  const untouched = state.history.past.length === 0 && !alreadySaved;
  useEffect(() => {
    if (!isDirty(state) || untouched) return;
    setSaveState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [state, untouched, save]);

  // Warn before closing the page only if something could still be lost.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty(stateRef.current) && !(stateRef.current.history.past.length === 0 && !alreadySaved)) {
        void save();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [alreadySaved, save]);

  return { state, dispatch, save, saveState: untouched ? 'saved' : saveState, untouched };
}
