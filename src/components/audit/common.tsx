import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCw, ShieldOff, WifiOff, TriangleAlert, SearchX } from 'lucide-react';
import type { ApiError } from '../../lib/api/errors';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-heading text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Copies text and confirms it, announcing the result to assistive technology. */
export function CopyButton({
  value,
  label,
  className,
  children,
}: {
  value: string;
  /** What is being copied, e.g. "trace ID". */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
      setCopied(false);
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  };

  return (
    <>
      <Button
        variant="outline"
        size={children ? 'sm' : 'icon'}
        className={cn(!children && 'h-8 w-8', className)}
        onClick={copy}
        aria-label={children ? undefined : `Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {children}
      </Button>
      <span role="status" className="sr-only">
        {copied ? `Copied ${label}` : failed ? `Could not copy ${label}` : ''}
      </span>
    </>
  );
}

/** What a failed request looks like to a person: a plain explanation, what to do, and a reference to quote. */
export function ErrorPanel({
  error,
  onRetry,
  title,
  className,
}: {
  error: ApiError;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const Icon = error.kind === 'network' ? WifiOff : error.kind === 'forbidden' ? ShieldOff : error.kind === 'not_found' ? SearchX : TriangleAlert;
  const heading =
    title ??
    (error.kind === 'forbidden'
      ? 'You don’t have access to this'
      : error.kind === 'not_found'
        ? 'Not found'
        : error.kind === 'network'
          ? 'Connection problem'
          : error.kind === 'rate_limited'
            ? 'Too many requests'
            : 'We couldn’t load this');
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive-subtle text-destructive" aria-hidden="true">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-title text-foreground">{heading}</h3>
      <p className="mt-1.5 max-w-md text-body text-muted-foreground">
        {error.message}
        {error.kind === 'rate_limited' && error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds} seconds.` : ''}
      </p>
      {error.issues.length > 0 && (
        <ul className="mt-3 max-w-md space-y-1 text-body text-foreground">
          {error.issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>
              <span className="font-medium">{issue.path}</span>: {issue.message}
            </li>
          ))}
        </ul>
      )}
      {error.retryable && onRetry && (
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
      {error.traceId && (
        <p className="mt-4 text-caption text-muted-foreground">
          Reference <span className="font-mono">{error.traceId}</span>
        </p>
      )}
    </div>
  );
}

export function NoResults({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return <EmptyState icon={<SearchX className="h-6 w-6" />} title={title} description={description} action={action} />;
}

/** Monospace identifier that can be selected and wraps instead of overflowing. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('break-all font-mono text-caption', className)}>{children}</span>;
}
