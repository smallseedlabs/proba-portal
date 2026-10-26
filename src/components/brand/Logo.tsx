import { cn } from '../../lib/utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#293ABC" />
      <path d="M23 46V18h11a10 10 0 0 1 0 20h-5" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="45" r="4" fill="#5EEAD4" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('text-[1.25rem] font-semibold tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
        Proba <span className={cn('font-medium', inverted ? 'text-[#5EEAD4]' : 'text-primary')}>Insights</span>
      </span>
    </span>
  );
}
