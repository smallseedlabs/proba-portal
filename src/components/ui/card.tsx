import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-card', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
  titleAs: TitleTag = 'h3',
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleAs?: 'h2' | 'h3' | 'h4';
  id?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b px-5 py-4', className)}>
      <div className="min-w-0">
        <TitleTag id={id} className="text-title text-foreground">
          {title}
        </TitleTag>
        {description && <p className="mt-0.5 text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-t bg-surface-sunken/60 px-5 py-3', className)} {...props} />;
}
