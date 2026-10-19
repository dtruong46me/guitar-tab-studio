/**
 * Shared controls. Every interactive surface in the app is built from these so sizes, states and
 * tooltips stay consistent: 28px controls, radius-md, one accent, shortcut hints in tooltips.
 */
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';
// Literal class names so Tailwind's content scan keeps every variant.
const VARIANT_CLASS: Record<Variant, string> = { default: '', primary: 'btn-primary', ghost: 'btn-ghost', danger: 'btn-danger' };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: PhosphorIcon;
  /** Tooltip text; shown with `shortcut` by the tooltip layer. */
  tip?: string;
  shortcut?: string;
  pressed?: boolean;
  /** Keep keyboard focus where it is (in the tab sheet) when clicked. */
  keepFocus?: boolean;
  size?: 'sm' | 'md';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon: IconCmp, tip, shortcut, pressed, keepFocus, size = 'md', className = '', children, ...rest },
  ref,
) {
  const iconOnly = !children;
  return (
    <button
      ref={ref}
      type="button"
      className={`btn ${VARIANT_CLASS[variant]} ${iconOnly ? 'btn-icon' : ''} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      aria-pressed={pressed}
      aria-label={iconOnly ? tip : undefined}
      data-tip={tip}
      data-kbd={shortcut}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      {...rest}
    >
      {IconCmp && <IconCmp size={16} weight={pressed ? 'fill' : 'regular'} aria-hidden />}
      {children}
    </button>
  );
});

/** Segmented control: one choice out of a few, e.g. durations or 6/7 strings. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  mono,
}: {
  value: T | null;
  options: { value: T; label: React.ReactNode; tip?: string; shortcut?: string }[];
  onChange: (v: T) => void;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={mono ? 'font-mono' : ''}
          aria-pressed={value === o.value}
          data-tip={o.tip}
          data-kbd={o.shortcut}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Thin vertical divider between toolbar groups. */
export const Divider = () => <div className="w-px self-stretch my-1.5 bg-line shrink-0" aria-hidden />;

/** Keyboard key chips. Splits "Ctrl + Shift + Z" into separate keys. */
export function Keys({ combo }: { combo: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {combo.split(' + ').map((k, i) => (
        <kbd key={i} className="kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * One tooltip for the whole app: any element with data-tip (and optional data-kbd) gets a styled
 * tooltip after a short hover delay. Fixed-positioned, so it is never clipped by scroll areas.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; kbd?: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const show = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      window.clearTimeout(timer.current);
      if (!el || !el.dataset.tip) {
        setTip(null);
        return;
      }
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const below = r.top < 80;
        setTip({ text: el.dataset.tip!, kbd: el.dataset.kbd, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, 450);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      setTip(null);
    };
    document.addEventListener('mouseover', show);
    document.addEventListener('mousedown', hide);
    document.addEventListener('keydown', hide);
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('keydown', hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="fixed z-[70] pointer-events-none flex items-center gap-2 px-2 py-1 rounded-md bg-ink text-bg100 text-xs shadow-lg max-w-[280px] tooltip-in"
      style={{ left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140), top: tip.y, transform: `translate(-50%, ${tip.below ? '0' : '-100%'})` }}
    >
      <span>{tip.text}</span>
      {tip.kbd && <span className="font-mono text-[11px] opacity-70 whitespace-nowrap">{tip.kbd}</span>}
    </div>
  );
}

/** Small dropdown menu anchored to a trigger button. */
export function Menu({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  items: ({ label: string; icon?: PhosphorIcon; onSelect: () => void; danger?: boolean } | 'separator')[];
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div role="menu" className={`absolute z-40 min-w-[180px] py-1 rounded-md border border-line bg-bg200 shadow-xl menu-in ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${align === 'end' ? 'right-0' : 'left-0'}`}>
          {items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                className={`w-full flex items-center gap-2 h-8 px-3 text-left text-[13px] hover:bg-bg300 ${it.danger ? 'text-danger' : 'text-ink'}`}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon && <it.icon size={16} aria-hidden />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Toast shown at the bottom centre. */
export function Toast({ text, tone }: { text: string; tone: 'info' | 'error' }) {
  return (
    <div role="status" className={`fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] px-3 py-2 rounded-md border text-[13px] shadow-lg bg-bg200 toast-in ${tone === 'error' ? 'border-danger text-danger' : 'border-line text-ink'}`}>
      {text}
    </div>
  );
}
