import { useEffect, useRef } from 'react';
import { Icon } from './icons';

/** Accessible modal dialog shell: focus moves in on open, Escape closes, focus is restored on close. */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex flex-col max-h-full rounded-lg border border-line bg-bg100 shadow-2xl outline-none ${wide ? 'w-[min(1200px,100%)] h-full' : 'w-[min(640px,100%)]'}`}
      >
        <div className="flex items-center h-12 px-4 border-b border-line shrink-0">
          <h2 className="text-[15px] font-semibold flex-1">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
            {Icon.close}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        {footer && <div className="flex items-center gap-2 h-14 px-4 border-t border-line shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
