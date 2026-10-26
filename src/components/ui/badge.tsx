import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  primary: 'bg-primary-subtle text-primary ring-primary/20',
  success: 'bg-success-subtle text-success ring-success/20',
  warning: 'bg-warning-subtle text-warning ring-warning/25',
  danger: 'bg-destructive-subtle text-destructive ring-destructive/20',
  info: 'bg-info-subtle text-info ring-info/20',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium ring-1 ring-inset',
        tones[tone],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
