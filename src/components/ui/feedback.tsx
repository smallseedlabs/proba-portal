import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted-foreground">
      <LoaderCircle className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />
      <span className={label ? 'text-body' : 'sr-only'}>{label ?? 'Loading'}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden="true" />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-title text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-body text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const calloutStyles: Record<CalloutTone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-info/30 bg-info-subtle text-foreground', icon: <Info className="h-4 w-4 text-info" aria-hidden="true" /> },
  success: { box: 'border-success/30 bg-success-subtle text-foreground', icon: <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> },
  warning: { box: 'border-warning/30 bg-warning-subtle text-foreground', icon: <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" /> },
  danger: { box: 'border-destructive/30 bg-destructive-subtle text-foreground', icon: <CircleAlert className="h-4 w-4 text-destructive" aria-hidden="true" /> },
};

export function Callout({
  tone = 'info',
  title,
  children,
  onDismiss,
  role,
  className,
  actions,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  role?: 'alert' | 'status';
  className?: string;
  actions?: ReactNode;
}) {
  const style = calloutStyles[tone];
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', style.box, className)}>
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-body font-semibold">{title}</p>}
        {children && <div className={cn('text-body text-foreground/85', title && 'mt-0.5')}>{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
