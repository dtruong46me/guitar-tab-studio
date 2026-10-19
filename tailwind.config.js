/** Colors map to the Guitar Tab Studio design-system tokens (CSS variables in src/ui/tokens.css). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg0: 'var(--bg-0)',
        bg100: 'var(--bg-100)',
        bg200: 'var(--bg-200)',
        bg300: 'var(--bg-300)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--ink-muted)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-text': 'var(--accent-text)',
        cursor: 'var(--cursor)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        sheet: 'var(--sheet)',
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { sm: '3px', md: '6px', lg: '10px' },
    },
  },
  plugins: [],
};
