/** Workspace layout preferences: which side panels are open and how the tool panel is arranged. */
import { useCallback, useState } from 'react';

export const TOOL_SECTIONS = ['frets', 'duration', 'connect', 'bend', 'expression', 'beat'] as const;
export type ToolSection = (typeof TOOL_SECTIONS)[number];

export interface PanelPrefs {
  left: boolean;
  right: boolean;
  /** Tool sections in display order. */
  order: ToolSection[];
  hidden: ToolSection[];
  /** Collapsed section ids, across both panels. */
  collapsed: string[];
}

const KEY = 'gts:panels';
export const DEFAULT_PREFS: PanelPrefs = { left: true, right: true, order: [...TOOL_SECTIONS], hidden: [], collapsed: [] };

/** Read stored prefs, dropping unknown sections and appending any added since they were saved. */
export function normalizePrefs(raw: unknown): PanelPrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const r = raw as Partial<PanelPrefs>;
  const known = (xs: unknown): ToolSection[] => (Array.isArray(xs) ? xs.filter((x): x is ToolSection => (TOOL_SECTIONS as readonly string[]).includes(x)) : []);
  const order = [...new Set(known(r.order))];
  for (const s of TOOL_SECTIONS) if (!order.includes(s)) order.push(s);
  return {
    left: r.left !== false,
    right: r.right !== false,
    order,
    hidden: known(r.hidden),
    collapsed: Array.isArray(r.collapsed) ? r.collapsed.filter((x): x is string => typeof x === 'string') : [],
  };
}

function load(): PanelPrefs {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePanelPrefs() {
  const [prefs, setPrefs] = useState<PanelPrefs>(load);
  const update = useCallback((fn: (p: PanelPrefs) => PanelPrefs) => {
    setPrefs((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* preferences are optional */
      }
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(
    (id: string) => update((p) => ({ ...p, collapsed: p.collapsed.includes(id) ? p.collapsed.filter((x) => x !== id) : [...p.collapsed, id] })),
    [update],
  );
  const toggleHidden = useCallback(
    (id: ToolSection) => update((p) => ({ ...p, hidden: p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id] })),
    [update],
  );
  const move = useCallback(
    (id: ToolSection, dir: -1 | 1) =>
      update((p) => {
        const i = p.order.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.order.length) return p;
        const order = [...p.order];
        [order[i], order[j]] = [order[j], order[i]];
        return { ...p, order };
      }),
    [update],
  );
  const setPanel = useCallback((side: 'left' | 'right', open: boolean) => update((p) => ({ ...p, [side]: open })), [update]);
  const reset = useCallback(() => update((p) => ({ ...DEFAULT_PREFS, left: p.left, right: p.right })), [update]);

  return { prefs, toggleCollapsed, toggleHidden, move, setPanel, reset };
}
