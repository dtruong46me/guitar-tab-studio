import { ArrowDown, ArrowUp, CaretRight, Eye, EyeSlash } from '@phosphor-icons/react';
import { Button } from '../controls';

/** Collapsible section of a side panel. In customize mode it shows visibility and order controls. */
export function PanelSection({
  id,
  title,
  meta,
  collapsed,
  onToggle,
  customize,
  children,
}: {
  id: string;
  title: string;
  /** Short context on the right of the header (e.g. "B string"). */
  meta?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  customize?: { hidden: boolean; onHide: () => void; onUp?: () => void; onDown?: () => void };
  children: React.ReactNode;
}) {
  // While customizing, sections fold up so they are easy to reorder.
  const open = !collapsed && !customize;
  return (
    <section className={`border-b border-line ${customize?.hidden ? 'opacity-50' : ''}`} aria-labelledby={`sec-${id}`}>
      <div className="flex items-center h-9 pl-2 pr-2 gap-1">
        <button
          type="button"
          id={`sec-${id}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggle}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-1.5 h-7 rounded-md text-left text-[12px] font-semibold text-ink hover:text-accent-text"
        >
          <CaretRight size={12} weight="bold" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <span className="truncate">{title}</span>
        </button>
        {customize ? (
          <>
            <Button size="sm" variant="ghost" icon={ArrowUp} disabled={!customize.onUp} onClick={customize.onUp} tip="Move up" />
            <Button size="sm" variant="ghost" icon={ArrowDown} disabled={!customize.onDown} onClick={customize.onDown} tip="Move down" />
            <Button size="sm" variant="ghost" icon={customize.hidden ? EyeSlash : Eye} onClick={customize.onHide} tip={customize.hidden ? 'Show this group' : 'Hide this group'} />
          </>
        ) : (
          meta && <span className="text-[11px] text-muted truncate">{meta}</span>
        )}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

/** Compact tool button for side panels: label on the left, shortcut chip on the right. */
export function ToolButton({
  label,
  shortcut,
  tip,
  pressed,
  disabled,
  onClick,
  className = '',
}: {
  label: React.ReactNode;
  shortcut?: string;
  tip: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn justify-between px-2 ${className}`}
      aria-pressed={pressed}
      disabled={disabled}
      data-tip={tip}
      data-kbd={shortcut}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {shortcut && <span className={`font-mono text-[10px] ${pressed ? 'opacity-70' : 'text-muted'}`}>{shortcut}</span>}
    </button>
  );
}
