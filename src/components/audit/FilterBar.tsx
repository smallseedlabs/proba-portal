import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { ACTOR_TYPES, CATEGORIES, OUTCOMES, RISK_LEVELS, type Facets } from '../../lib/api/schemas';
import {
  DEFAULT_FILTERS,
  RANGE_PRESETS,
  countActiveFilters,
  isAnchored,
  validateFilters,
  type EventFilters,
  type FilterErrors,
  type RangePreset,
} from '../../lib/filters';
import { ACTOR_TYPE_LABELS, CATEGORY_LABELS, OUTCOME_LABELS, RISK_LABELS } from '../../lib/labels';
import { fromInputValue, toInputValue, zoneLabel } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/button';
import { Card, CardBody } from '../ui/card';
import { FieldError, Input, Label, NativeSelect } from '../ui/field';

function Field({ label, error, errorId, children }: { label: string; error?: string; errorId: string; children: (props: { id: string; invalid?: true; describedBy?: string }) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, invalid: error ? true : undefined, describedBy: error ? errorId : undefined })}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

function counts(facets: Facets | undefined, name: keyof Facets['facets']): Map<string, number> {
  return new Map((facets?.facets[name] ?? []).map((f) => [f.value, f.count]));
}

function withCount(label: string, count: number | undefined): string {
  return count === undefined ? label : `${label} (${count.toLocaleString('en-GB')})`;
}

const SECONDARY_KEYS = ['service', 'action', 'actorType', 'actor', 'campaignId', 'traceId', 'goalId', 'threadId'] as const;

export function FilterBar({
  value,
  facets,
  onApply,
}: {
  /** The filters currently applied. The bar edits a draft and applies it on Search. */
  value: EventFilters;
  facets?: Facets;
  onApply: (filters: EventFilters) => void;
}) {
  const { mode } = useTimeMode();
  const [draft, setDraft] = useState<EventFilters>(value);
  const [errors, setErrors] = useState<FilterErrors>({});
  const hasSecondary = SECONDARY_KEYS.some((k) => Boolean(value[k]));
  const [expanded, setExpanded] = useState(hasSecondary);
  const panelId = useId();
  const listIds = { service: useId(), action: useId(), actor: useId(), campaign: useId() };

  const set = <K extends keyof EventFilters>(key: K, next: EventFilters[K] | '') => {
    setDraft((d) => {
      const copy = { ...d };
      if (next === '' || next === undefined) delete copy[key];
      else copy[key] = next as EventFilters[K];
      return copy;
    });
  };
  const text = (key: keyof EventFilters) => (draft[key] as string | undefined) ?? '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed: EventFilters = { ...draft };
    for (const key of ['traceId', 'actor', 'service', 'action', 'goalId', 'threadId', 'campaignId', 'q'] as const) {
      const v = trimmed[key]?.trim();
      if (v) trimmed[key] = v;
      else delete trimmed[key];
    }
    const found = validateFilters(trimmed);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      if (SECONDARY_KEYS.some((k) => found[k])) setExpanded(true);
      return;
    }
    onApply(trimmed);
  };

  const reset = () => {
    setDraft(DEFAULT_FILTERS);
    setErrors({});
    onApply(DEFAULT_FILTERS);
  };

  const active = countActiveFilters(value);
  const facetOptions = (name: keyof Facets['facets']) => (facets?.facets[name] ?? []).map((f) => f.value);

  return (
    <Card>
      <form onSubmit={submit} noValidate aria-label="Filter audit events">
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Text search" error={errors.q} errorId="err-q">
                {({ id, invalid, describedBy }) => (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id={id}
                      type="search"
                      className="pl-9"
                      placeholder="Action or target, e.g. approval"
                      value={text('q')}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => set('q', e.target.value)}
                    />
                  </div>
                )}
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Time range" error={errors.range} errorId="err-range">
                {({ id, invalid, describedBy }) => (
                  <NativeSelect
                    id={id}
                    value={draft.range}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => {
                      const range = e.target.value as RangePreset;
                      setDraft((d) => ({ ...d, range, ...(range === 'custom' ? {} : { from: undefined, to: undefined }) }));
                    }}
                  >
                    {RANGE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                    <option value="any" disabled={!isAnchored(draft)}>
                      Any time (with a trace, goal or thread ID)
                    </option>
                    <option value="custom">Custom range…</option>
                  </NativeSelect>
                )}
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Outcome" errorId="err-outcome">
                {({ id }) => (
                  <NativeSelect id={id} value={draft.outcome ?? ''} onChange={(e) => set('outcome', e.target.value as EventFilters['outcome'] | '')}>
                    <option value="">All outcomes</option>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {withCount(OUTCOME_LABELS[o], counts(facets, 'outcome').get(o))}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Category" errorId="err-category">
                {({ id }) => (
                  <NativeSelect id={id} value={draft.category ?? ''} onChange={(e) => set('category', e.target.value as EventFilters['category'] | '')}>
                    <option value="">All categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {withCount(CATEGORY_LABELS[c], counts(facets, 'category').get(c))}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Risk" errorId="err-risk">
                {({ id }) => (
                  <NativeSelect id={id} value={draft.riskLevel ?? ''} onChange={(e) => set('riskLevel', e.target.value as EventFilters['riskLevel'] | '')}>
                    <option value="">Any risk</option>
                    {RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>
                        {withCount(RISK_LABELS[r], counts(facets, 'riskLevel').get(r))}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
          </div>

          {draft.range === 'custom' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={`From (${zoneLabel(mode)})`} errorId="err-from">
                {({ id }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={toInputValue(draft.from, mode)}
                    onChange={(e) => setDraft((d) => ({ ...d, from: fromInputValue(e.target.value, mode) }))}
                  />
                )}
              </Field>
              <Field label={`To (${zoneLabel(mode)})`} errorId="err-to">
                {({ id }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={toInputValue(draft.to, mode)}
                    onChange={(e) => setDraft((d) => ({ ...d, to: fromInputValue(e.target.value, mode) }))}
                  />
                )}
              </Field>
            </div>
          )}

          <div id={panelId} hidden={!expanded} className={cn(expanded && 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4')}>
            <Field label="Service" errorId="err-service">
              {({ id }) => (
                <>
                  <Input id={id} list={listIds.service} placeholder="e.g. proba-tools" value={text('service')} onChange={(e) => set('service', e.target.value)} />
                  <datalist id={listIds.service}>
                    {facetOptions('service').map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Action" error={errors.action} errorId="err-action">
              {({ id, invalid, describedBy }) => (
                <>
                  <Input
                    id={id}
                    list={listIds.action}
                    placeholder="e.g. policy.denied"
                    value={text('action')}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => set('action', e.target.value)}
                  />
                  <datalist id={listIds.action}>
                    {facetOptions('action').map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Actor type" errorId="err-actorType">
              {({ id }) => (
                <NativeSelect id={id} value={draft.actorType ?? ''} onChange={(e) => set('actorType', e.target.value as EventFilters['actorType'] | '')}>
                  <option value="">Any actor type</option>
                  {ACTOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {withCount(ACTOR_TYPE_LABELS[t], counts(facets, 'actorType').get(t))}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Actor" errorId="err-actor">
              {({ id }) => (
                <>
                  <Input id={id} list={listIds.actor} placeholder="e.g. usr_amelia_frost" value={text('actor')} onChange={(e) => set('actor', e.target.value)} />
                  <datalist id={listIds.actor}>
                    {facetOptions('actorId').map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Campaign" error={errors.campaignId} errorId="err-campaignId">
              {({ id, invalid, describedBy }) => (
                <>
                  <Input
                    id={id}
                    list={listIds.campaign}
                    placeholder="Campaign ID"
                    value={text('campaignId')}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => set('campaignId', e.target.value)}
                  />
                  <datalist id={listIds.campaign}>
                    {facetOptions('campaignId').map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            {(['traceId', 'goalId', 'threadId'] as const).map((key) => (
              <Field
                key={key}
                label={key === 'traceId' ? 'Trace ID' : key === 'goalId' ? 'Goal ID' : 'Thread ID'}
                error={errors[key]}
                errorId={`err-${key}`}
              >
                {({ id, invalid, describedBy }) => (
                  <Input
                    id={id}
                    className="font-mono text-caption"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    spellCheck={false}
                    value={text(key)}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(e) => set(key, e.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </Button>
            <Button type="button" variant="ghost" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-controls={panelId}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {expanded ? 'Fewer filters' : 'More filters'}
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </Button>
            {(active > 0 || value.range !== DEFAULT_FILTERS.range) && (
              <Button type="button" variant="ghost" onClick={reset}>
                <X className="h-4 w-4" aria-hidden="true" />
                Clear filters
              </Button>
            )}
            {active > 0 && (
              <span className="text-caption text-muted-foreground" aria-live="polite">
                {active} {active === 1 ? 'filter' : 'filters'} applied
              </span>
            )}
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
