import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export interface MenuItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  checked?: boolean;
  tone?: 'default' | 'danger';
}

export interface MenuSection {
  label?: ReactNode;
  items: MenuItem[];
}

/**
 * Accessible dropdown menu (WAI-ARIA menu button pattern): arrow keys move
 * between items, Home/End jump, Escape closes and returns focus to the trigger.
 */
export function Menu({
  trigger,
  triggerLabel,
  menuLabel,
  sections,
  align = 'end',
  header,
  className,
  triggerClassName,
}: {
  trigger: ReactNode;
  /** Optional accessible name override; by default the trigger's content names it. */
  triggerLabel?: string;
  /** Accessible name of the opened menu. */
  menuLabel: string;
  sections: MenuSection[];
  align?: 'start' | 'end';
  header?: ReactNode;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasCheckable = sections.some((s) => s.items.some((i) => i.checked !== undefined));

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        close(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, close]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          triggerClassName
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute top-full z-40 mt-2 min-w-[240px] overflow-hidden rounded-lg border bg-surface-raised py-1 shadow-overlay animate-slide-up',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {header && <div className="border-b px-3 py-2.5">{header}</div>}
          {sections.map((section, si) => (
            <div key={si} role="group" className={cn(si > 0 && 'border-t', 'py-1')}>
              {section.label && (
                <div className="px-3 pb-1 pt-2 text-caption font-medium uppercase tracking-wide text-muted-foreground" aria-hidden="true">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                  aria-checked={item.checked}
                  tabIndex={-1}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-body outline-none hover:bg-muted focus:bg-muted',
                    item.tone === 'danger' ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {item.icon && <span className="shrink-0 text-muted-foreground" aria-hidden="true">{item.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.description && <span className="block truncate text-caption text-muted-foreground">{item.description}</span>}
                  </span>
                  {hasCheckable && (
                    <Check className={cn('h-4 w-4 shrink-0 text-primary', !item.checked && 'invisible')} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
