import { useCallback, useEffect, useRef, useState } from 'react';
import { listProjects, type ProjectSummary } from '../io/storage';
import type { Studio } from './useStudio';
import { Icon } from './icons';
import { Modal } from './Modal';

/** Project management: open, create, rename, duplicate, delete, import and export. */
export function ProjectsDialog({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const currentId = studio.state.song.id;

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setError('Browser storage is unavailable, so projects cannot be listed. You can still import and export JSON files.'));
  }, []);
  useEffect(refresh, [refresh]);

  const act = (fn: () => Promise<unknown> | void) => async () => {
    await fn();
    refresh();
  };

  return (
    <Modal
      title="Projects"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => (studio.newProject(), onClose())} title="Start an empty composition">
            {Icon.plus} New
          </button>
          <button className="btn" onClick={act(() => studio.duplicate())} title="Save a copy of the open project">
            {Icon.copy} Duplicate current
          </button>
          <div className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) {
                await studio.importJson(f);
                onClose();
              }
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()} title="Open a project from a JSON file">
            {Icon.upload} Import JSON
          </button>
          <button className="btn" onClick={studio.exportJson} title="Download the open project as a portable JSON file">
            {Icon.download} Export JSON
          </button>
        </>
      }
    >
      <div className="p-4">
        {error && <p className="text-danger text-sm">{error}</p>}
        {!error && projects === null && <p className="text-muted text-sm">Loading…</p>}
        {projects?.length === 0 && <p className="text-muted text-sm">No saved projects yet. Press Save (Ctrl+S) to keep the current one in this browser.</p>}
        <ul className="flex flex-col gap-1">
          {projects?.map((p) => (
            <li key={p.id} className={`group flex items-center gap-2 rounded-md px-2 h-11 border ${p.id === currentId ? 'border-accent bg-bg200' : 'border-transparent hover:bg-bg200'}`}>
              {renaming === p.id ? (
                <input
                  autoFocus
                  className="field flex-1"
                  value={draft}
                  maxLength={120}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      await studio.rename(p.id, draft);
                      setRenaming(null);
                      refresh();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                  onBlur={() => setRenaming(null)}
                  aria-label="Project name"
                />
              ) : (
                <button className="flex-1 min-w-0 text-left" onClick={act(async () => (await studio.open(p.id), onClose()))} title="Open">
                  <div className="truncate text-[13px] font-medium">
                    {p.title || 'Untitled'} {p.id === currentId && <span className="text-[11px] text-accent-text ml-1">open</span>}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {[p.artist, `${p.measures} measures`, new Date(p.updatedAt).toLocaleString()].filter(Boolean).join(' · ')}
                  </div>
                </button>
              )}
              <button className="btn btn-ghost btn-icon" title="Rename" aria-label={`Rename ${p.title}`} onMouseDown={(e) => e.preventDefault()} onClick={() => (setRenaming(p.id), setDraft(p.title))}>
                {Icon.edit}
              </button>
              <button className="btn btn-ghost btn-icon" title="Duplicate" aria-label={`Duplicate ${p.title}`} onClick={act(() => studio.duplicate(p.id))}>
                {Icon.copy}
              </button>
              <button
                className="btn btn-ghost btn-icon text-danger"
                title="Delete"
                aria-label={`Delete ${p.title}`}
                onClick={act(() => (window.confirm(`Delete "${p.title}"? This cannot be undone.`) ? studio.remove(p.id) : undefined))}
              >
                {Icon.trash}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
