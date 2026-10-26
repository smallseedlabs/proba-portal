import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
  icon?: ReactNode;
  size?: 'sm' | 'md';
  /** Use alertdialog for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
}

/** Accessible modal dialog: focus trap, Escape to close, focus restored on close. */
export function Dialog({ open, onClose, title, description, children, footer, tone = 'default', icon, size = 'md', role = 'dialog' }: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative w-full rounded-xl border bg-surface-raised shadow-overlay animate-slide-up',
          size === 'sm' ? 'max-w-md' : 'max-w-lg'
        )}
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          {icon && (
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                tone === 'danger' ? 'bg-destructive-subtle text-destructive' : 'bg-primary-subtle text-primary'
              )}
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-title text-foreground">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1.5 text-body text-muted-foreground">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children && <div className="px-6 pt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2 rounded-b-xl border-t bg-surface-sunken/60 px-6 py-4">{footer}</div>}
        {!footer && <div className="pb-6" />}
      </div>
    </div>,
    document.body
  );
}
