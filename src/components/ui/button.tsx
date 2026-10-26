import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  outline: 'border border-input/60 bg-surface text-foreground hover:bg-muted shadow-sm',
  ghost: 'text-foreground hover:bg-muted',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-sm',
  'danger-outline': 'border border-destructive/50 bg-surface text-destructive hover:bg-destructive-subtle shadow-sm',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption font-medium gap-1.5',
  md: 'h-9 px-4 text-body font-medium gap-2',
  lg: 'h-11 px-5 text-lead font-medium gap-2',
  icon: 'h-9 w-9 p-0',
};

/** Class names of a button, for links that should look like one. */
// eslint-disable-next-line react-refresh/only-export-components
export function buttonClassName(variant: ButtonVariant = 'outline', size: ButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    variants[variant],
    sizes[size],
    className
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-60',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
