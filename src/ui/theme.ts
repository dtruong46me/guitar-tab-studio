import { useEffect, useState } from 'react';

export type Theme = 'studio' | 'paper';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('gts:theme');
    if (saved === 'studio' || saved === 'paper') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'paper' : 'studio';
}

/** App theme: follows the system on first visit, then remembers the user's choice. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const set = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem('gts:theme', t);
    } catch {
      /* not critical */
    }
  };
  return [theme, set];
}
