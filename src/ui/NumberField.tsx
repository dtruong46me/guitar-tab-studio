import { useEffect, useState } from 'react';

/** Integer input that keeps a local draft and commits a clamped value on Enter or blur. */
export function NumberField({
  value,
  min,
  max,
  onCommit,
  className = 'field',
  ariaLabel,
  placeholder,
}: {
  value: number | null;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  className?: string;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isNaN(n)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      className={className}
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setDraft(value === null ? '' : String(value));
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = value ?? min;
          onCommit(Math.min(max, Math.max(min, base + (e.key === 'ArrowUp' ? 1 : -1))));
        }
      }}
    />
  );
}
