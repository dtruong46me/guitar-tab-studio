import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, DotsThree, DownloadSimple, FolderOpen, Guitar, MagnifyingGlass, Moon, PencilSimple, Plus, Sun, Trash, UploadSimple } from '@phosphor-icons/react';
import type { Song } from '../../model/types';
import { cloneSongWithNewIds } from '../../model/factory';
import { TEMPLATES } from '../../model/templates';
import { parseProject, serializeProject } from '../../io/json';
import { deleteProject, listSongs, saveProject } from '../../io/storage';
import { Button, Menu } from '../controls';
import { downloadBlob, relativeTime, safeFileName } from '../files';
import { TabThumbnail } from '../TabThumbnail';
import type { Theme } from '../theme';

interface Props {
  onOpen: (song: Song) => void;
  onCreate: (song: Song) => void;
  notify: (text: string, tone?: 'info' | 'error') => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
}

type Sort = 'recent' | 'title';

export function HomeScreen({ onOpen, onCreate, notify, theme, onTheme }: Props) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const fileRef = useRef<HTMLInputElement>(null);
  const templates = useMemo(() => TEMPLATES.map((t) => ({ ...t, preview: t.create() })), []);

  const refresh = useCallback(() => {
    listSongs()
      .then(setSongs)
      .catch(() => {
        setFailed(true);
        setSongs([]);
      });
  }, []);
  useEffect(refresh, [refresh]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (songs ?? []).filter((s) => !q || `${s.meta.title} ${s.meta.artist}`.toLowerCase().includes(q));
    return sort === 'title' ? [...list].sort((a, b) => (a.meta.title || 'Untitled').localeCompare(b.meta.title || 'Untitled')) : list;
  }, [songs, query, sort]);

  const importFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return notify('That file is too large to be a tab project.', 'error');
    const result = parseProject(await file.text());
    if (!result.ok) return notify(`Import failed: ${result.error}`, 'error');
    const song = cloneSongWithNewIds(result.song);
    await saveProject(song);
    notify(result.warnings.length ? `Imported with warnings: ${result.warnings.join(' ')}` : `Imported "${song.meta.title}".`);
    onOpen(song);
  };

  const duplicate = async (song: Song) => {
    const copy = cloneSongWithNewIds(song);
    copy.meta = { ...copy.meta, title: `${copy.meta.title || 'Untitled'} (copy)` };
    await saveProject(copy);
    notify(`Duplicated as "${copy.meta.title}".`);
    refresh();
  };

  const remove = async (song: Song) => {
    if (!window.confirm(`Delete "${song.meta.title || 'Untitled'}"? This cannot be undone.`)) return;
    await deleteProject(song.id);
    notify('Tab deleted.');
    refresh();
  };

  const rename = async (song: Song, title: string) => {
    const name = title.trim();
    if (!name || name === song.meta.title) return;
    await saveProject({ ...song, meta: { ...song.meta, title: name } });
    refresh();
  };

  return (
    <div className="h-full flex flex-col screen-in">
      <header className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-line bg-bg100">
        <div className="flex items-center gap-2 mr-4">
          <span className="grid place-items-center w-7 h-7 rounded-md bg-accent text-accent-ink">
            <Guitar size={18} weight="bold" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Guitar Tab Studio</span>
        </div>
        <label className="relative w-full max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="field w-full pl-8" placeholder="Search tabs by title or artist" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tabs" />
        </label>
        <div className="flex-1" />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <Button icon={UploadSimple} onClick={() => fileRef.current?.click()} tip="Open a tab from a .json project file">
          Import
        </Button>
        <Button variant="ghost" icon={theme === 'studio' ? Sun : Moon} tip={theme === 'studio' ? 'Light theme' : 'Dark theme'} onClick={() => onTheme(theme === 'studio' ? 'paper' : 'studio')} />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-8 flex flex-col gap-10">
          <section aria-labelledby="new-heading">
            <h2 id="new-heading" className="text-base font-semibold mb-3">
              Start a new tab
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onCreate(t.create())}
                  className="group text-left rounded-lg border border-line bg-bg100 p-2 transition-colors hover:border-accent focus-visible:border-accent active:scale-[0.99]"
                >
                  <div className="relative rounded-md overflow-hidden bg-sheet aspect-[16/9] flex items-center px-1">
                    <TabThumbnail song={t.preview} width={300} />
                    {t.id === 'blank' && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid place-items-center w-9 h-9 rounded-full bg-accent text-accent-ink shadow-md transition-transform group-hover:scale-105">
                          <Plus size={18} weight="bold" aria-hidden />
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="px-1 pt-2">
                    <div className="text-[13px] font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted">{t.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="recent-heading">
            <div className="flex items-center gap-3 mb-3">
              <h2 id="recent-heading" className="text-base font-semibold">
                Your tabs
              </h2>
              {songs && songs.length > 0 && <span className="text-xs text-muted">{songs.length}</span>}
              <div className="flex-1" />
              {songs && songs.length > 1 && (
                <select className="field" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort tabs">
                  <option value="recent">Last edited</option>
                  <option value="title">Title A-Z</option>
                </select>
              )}
            </div>

            {failed && <p className="text-sm text-danger mb-3">Browser storage is unavailable, so saved tabs cannot be listed. Import and export still work.</p>}

            {songs === null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="rounded-lg border border-line bg-bg100 p-2">
                    <div className="rounded-md bg-bg300 aspect-[16/9] animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-bg300 mt-3 mb-2 animate-pulse" />
                    <div className="h-2.5 w-1/3 rounded bg-bg300 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState searching={!!query.trim() && (songs?.length ?? 0) > 0} onNew={() => onCreate(TEMPLATES[0].create())} onImport={() => fileRef.current?.click()} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visible.map((s) => (
                  <SongCard key={s.id} song={s} onOpen={() => onOpen(s)} onDuplicate={() => duplicate(s)} onDelete={() => remove(s)} onRename={(t) => rename(s, t)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function SongCard({ song, onOpen, onDuplicate, onDelete, onRename }: { song: Song; onOpen: () => void; onDuplicate: () => void; onDelete: () => void; onRename: (t: string) => void }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(song.meta.title);
  const notes = song.tracks.reduce((n, t) => n + t.measures.reduce((m, ms) => m + ms.beats.filter((b) => b.notes.length).length, 0), 0);

  return (
    <article className="group relative rounded-lg border border-line bg-bg100 p-2 transition-colors hover:border-accent focus-within:border-accent">
      <button type="button" onClick={onOpen} className="block w-full text-left rounded-md" aria-label={`Open ${song.meta.title || 'Untitled'}`}>
        <div className="rounded-md overflow-hidden bg-sheet aspect-[16/9] flex items-center px-1">
          <TabThumbnail song={song} />
        </div>
      </button>
      <div className="flex items-start gap-1 px-1 pt-2">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              autoFocus
              className="field h-6 w-full text-[13px]"
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onRename(draft);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setDraft(song.meta.title);
                  setRenaming(false);
                }
              }}
              aria-label="Tab title"
            />
          ) : (
            <h3 className="truncate text-[13px] font-medium" title={song.meta.title}>
              {song.meta.title || 'Untitled'}
            </h3>
          )}
          <p className="truncate text-[11px] text-muted">
            {[song.meta.artist, `${song.masterBars.length} bars`, notes === 0 ? 'empty' : null, relativeTime(song.updatedAt)].filter(Boolean).join(', ')}
          </p>
        </div>
        <Menu
          trigger={({ toggle, open }) => <Button size="sm" variant="ghost" icon={DotsThree} tip="More actions" onClick={toggle} aria-expanded={open} className="opacity-70 group-hover:opacity-100" />}
          items={[
            { label: 'Open', icon: FolderOpen, onSelect: onOpen },
            { label: 'Rename', icon: PencilSimple, onSelect: () => (setDraft(song.meta.title), setRenaming(true)) },
            { label: 'Duplicate', icon: Copy, onSelect: onDuplicate },
            { label: 'Export JSON', icon: DownloadSimple, onSelect: () => downloadBlob(new Blob([serializeProject(song)], { type: 'application/json' }), safeFileName(song, 'gts.json')) },
            'separator',
            { label: 'Delete', icon: Trash, onSelect: onDelete, danger: true },
          ]}
        />
      </div>
    </article>
  );
}

function EmptyState({ searching, onNew, onImport }: { searching: boolean; onNew: () => void; onImport: () => void }) {
  if (searching) return <p className="text-sm text-muted py-10 text-center">No tabs match your search.</p>;
  return (
    <div className="rounded-lg border border-dashed border-line py-12 px-6 flex flex-col items-center text-center gap-3">
      <Guitar size={32} className="text-muted" aria-hidden />
      <div>
        <p className="text-sm font-medium">No saved tabs yet</p>
        <p className="text-xs text-muted mt-1">Tabs save automatically as you write. Start one above or import a project file.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" icon={Plus} onClick={onNew}>
          New tab
        </Button>
        <Button icon={UploadSimple} onClick={onImport}>
          Import
        </Button>
      </div>
    </div>
  );
}
