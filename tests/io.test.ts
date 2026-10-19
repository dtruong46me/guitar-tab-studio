import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDemoSong } from '../src/model/demo';
import { cloneSongWithNewIds } from '../src/model/factory';
import { parseProject, serializeProject } from '../src/io/json';
import { deleteProject, listProjects, loadProject, saveProject } from '../src/io/storage';

describe('JSON project format', () => {
  it('round-trips a song losslessly', () => {
    const song = createDemoSong();
    const result = parseProject(serializeProject(song));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.song).toEqual(song);
      expect(result.warnings).toEqual([]);
    }
  });

  it('rejects malformed input with a readable error', () => {
    expect(parseProject('not json')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
    expect(parseProject('[]').ok).toBe(false);
    expect(parseProject(JSON.stringify({ format: 'other', song: {} })).ok).toBe(false);
    expect(parseProject(JSON.stringify({ format: 'guitar-tab-studio', version: 99, song: {} })).ok).toBe(false);
    expect(parseProject(JSON.stringify({ tracks: [] })).ok).toBe(false);
    expect(parseProject(JSON.stringify({ tracks: [{ instrument: { tuning: ['E4'] } }] })).ok).toBe(false);
  });

  it('normalises partial and invalid data', () => {
    const raw = {
      meta: { title: 'Sketch' },
      tempo: 9999,
      tracks: [
        {
          name: 'Lead',
          instrument: { tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'], capo: 40 },
          measures: [{ beats: [{ duration: { value: 3 }, notes: [{ string: 0, fret: 5, techniques: { vibrato: true, bogus: 1 } }, { string: 0, fret: 6 }, { string: 12, fret: 1 }] }] }, {}],
        },
      ],
    };
    const result = parseProject(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { song } = result;
    expect(song.meta.title).toBe('Sketch');
    expect(song.tempo).toBe(120);
    expect(song.tracks[0].instrument.capo).toBe(0);
    expect(song.masterBars).toHaveLength(2);
    const beat = song.tracks[0].measures[0].beats[0];
    expect(beat.duration).toEqual({ value: 4, dotted: false });
    expect(beat.notes).toEqual([{ string: 0, fret: 5, techniques: { vibrato: true } }]);
    expect(song.tracks[0].measures[1].beats).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('IndexedDB storage', () => {
  it('saves, lists, loads and deletes projects', async () => {
    const a = createDemoSong();
    const b = cloneSongWithNewIds(a);
    b.meta = { ...b.meta, title: 'Second' };
    await saveProject(a);
    await new Promise((r) => setTimeout(r, 5));
    await saveProject(b);
    const list = await listProjects();
    expect(list.map((p) => p.title)).toEqual(['Second', 'Technique Showcase']);
    const loaded = await loadProject(a.id);
    expect(loaded?.tracks).toEqual(a.tracks);
    await deleteProject(a.id);
    expect((await listProjects()).map((p) => p.id)).toEqual([b.id]);
  });
});
