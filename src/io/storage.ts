/** Local project persistence in IndexedDB. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Song } from '../model/types';

export interface ProjectSummary {
  id: string;
  title: string;
  artist: string;
  updatedAt: string;
  measures: number;
}

interface StudioDB extends DBSchema {
  projects: { key: string; value: Song; indexes: { updatedAt: string } };
}

export const DB_NAME = 'guitar-tab-studio';
let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

function db(): Promise<IDBPDatabase<StudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>(DB_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

/** Saves a project and returns the stored copy (with a fresh updatedAt). */
export async function saveProject(song: Song): Promise<Song> {
  const stored: Song = { ...song, updatedAt: new Date().toISOString() };
  await (await db()).put('projects', stored);
  return stored;
}

export async function loadProject(id: string): Promise<Song | undefined> {
  return (await db()).get('projects', id);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await (await db()).getAll('projects');
  return all
    .map((s) => ({ id: s.id, title: s.meta.title, artist: s.meta.artist, updatedAt: s.updatedAt, measures: s.masterBars.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const LAST_KEY = 'gts:lastProject';

export function rememberLastProject(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* storage unavailable: not critical */
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
