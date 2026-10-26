import type { ReactNode } from 'react';
import { Archive, CheckCircle2, CircleAlert, CircleCheck, CircleDashed, History, LoaderCircle, ShieldOff, Layers } from 'lucide-react';
import {
  CATEGORY_HELP,
  CATEGORY_LABELS,
  JOB_STATUS_LABELS,
  PROFILE_STATUS_HELP,
  PROFILE_STATUS_LABELS,
  STATUS_LABELS,
  labelOr,
} from '../../lib/memory/labels';
import type { JobStatus, MemoryCategory, MemoryStatus, ProfileStatus } from '../../lib/memory/schemas';
import { cn } from '../../lib/utils/cn';
import { Badge, type Tone } from '../ui/badge';
import { Card } from '../ui/card';
import { EmptyState } from '../ui/feedback';
import { PageHeader } from '../audit/common';

export function CategoryBadge({ category }: { category: MemoryCategory }) {
  return (
    <Badge tone="primary" title={CATEGORY_HELP[category]}>
      <Layers className="h-3 w-3" aria-hidden="true" />
      {labelOr(CATEGORY_LABELS, category)}
    </Badge>
  );
}

const STATUS_TONE: Record<MemoryStatus, Tone> = { active: 'success', superseded: 'neutral', tombstoned: 'neutral' };
const STATUS_ICON = { active: CircleCheck, superseded: History, tombstoned: Archive } as const;

/** The status is always written out and has an icon: it is never conveyed by colour alone. */
export function MemoryStatusBadge({ status }: { status: MemoryStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]} data-status={status}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const PROFILE_TONE: Record<ProfileStatus, Tone> = { draft: 'neutral', shadow: 'info', canary: 'warning', active: 'success', retired: 'neutral' };
const PROFILE_ICON = { draft: CircleDashed, shadow: CircleDashed, canary: CircleAlert, active: CheckCircle2, retired: Archive } as const;

export function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const Icon = PROFILE_ICON[status];
  return (
    <Badge tone={PROFILE_TONE[status]} data-profile-status={status} title={PROFILE_STATUS_HELP[status]}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {PROFILE_STATUS_LABELS[status]}
    </Badge>
  );
}

const JOB_TONE: Record<JobStatus, Tone> = { running: 'info', succeeded: 'success', failed: 'danger' };
const JOB_ICON = { running: LoaderCircle, succeeded: CircleCheck, failed: CircleAlert } as const;

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const Icon = JOB_ICON[status];
  return (
    <Badge tone={JOB_TONE[status]} data-job-status={status}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'motion-safe:animate-spin')} aria-hidden="true" />
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

/** A 0..1 value as a percentage and a small bar. The number is always written: the bar only helps. */
export function Meter({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
  return (
    <span className={cn('inline-flex items-center gap-2 tabular-nums', className)}>
      <span className="relative hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:inline-block" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.round(clamped * 100)}%` }} />
      </span>
      <span>{Math.round(clamped * 100)}%</span>
    </span>
  );
}

/** Shown to people who are not administrators on screens that are for administrators only. */
export function AdminOnly({ title, heading, description }: { title: string; heading: string; description: string }) {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 lg:px-8">
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={<ShieldOff className="h-6 w-6" />} title={heading} description={description} />
      </Card>
    </div>
  );
}

export function DefinitionGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</dl>;
}

export function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="mt-1 text-body text-foreground">{children}</dd>
    </div>
  );
}
