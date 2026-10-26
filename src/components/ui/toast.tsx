import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export interface ToastInput {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  title: string;
  description?: string;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  notify: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = {
  neutral: <Info className="h-4 w-4 text-info" aria-hidden="true" />,
  success: <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />,
  warning: <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />,
  danger: <CircleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />,
};

export function ToastProvider({ children, duration = 5000 }: { children: ReactNode; duration?: number }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss, duration]
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-raised px-4 py-3 shadow-overlay animate-slide-up'
            )}
          >
            <span className="mt-0.5">{icons[toast.tone ?? 'neutral']}</span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-foreground">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-body text-muted-foreground">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
