import { useMemo, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { SHORTCUTS } from '../editor/keymap';
import { Keys } from './controls';
import { Modal } from './Modal';

/** Shortcut guide: every keyboard shortcut, grouped and searchable. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUTS;
    return SHORTCUTS.map((g) => ({ ...g, items: g.items.filter(([k, a]) => `${k} ${a}`.toLowerCase().includes(q)) })).filter((g) => g.items.length);
  }, [query]);

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="px-5 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <label className="relative w-full max-w-xs">
            <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input autoFocus className="field w-full pl-8" placeholder="Find a shortcut" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a shortcut" />
          </label>
          <p className="text-xs text-muted">Click a string on the sheet first, then use the keys. Hover any button to see its shortcut.</p>
        </div>
        {groups.length === 0 && <p className="text-sm text-muted">No shortcut matches "{query}".</p>}
        <div className="columns-1 md:columns-2 xl:columns-3 gap-6">
          {groups.map((g) => (
            <section key={g.group} className="break-inside-avoid mb-6">
              <h3 className="text-[13px] font-semibold mb-2">{g.group}</h3>
              <dl className="flex flex-col">
                {g.items.map(([keys, desc]) => (
                  <div key={keys + desc} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-[13px]">{desc}</dt>
                    <dd className="m-0 shrink-0">
                      <Keys combo={keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
