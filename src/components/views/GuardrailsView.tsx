import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Shield } from 'lucide-react';
import { ApiError, isApiError } from '../../lib/api/errors';
import type { CreativeFile, GuardrailLimitKey, GuardrailsSnapshot, GuardrailsWrite, ReviewerFile, VerbMode } from '../../lib/gateway/schemas';
import { GUARDRAIL_LIMIT_KEYS } from '../../lib/gateway/schemas';
import { useGatewayApi } from '../../state/api';
import { PageHeader } from '../audit/common';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Callout, EmptyState, Skeleton } from '../ui/feedback';
import { FieldHint, Input, Label, NativeSelect } from '../ui/field';

const LIMIT_LABELS: Record<GuardrailLimitKey, string> = {
  maxIterations: 'Max iterations',
  maxLlmCalls: 'Max LLM calls',
  maxToolCalls: 'Max tool calls',
  maxPromptTokens: 'Max prompt tokens',
  maxCompletionTokens: 'Max completion tokens',
  maxTotalTokens: 'Max total tokens',
  maxCostUsd: 'Max cost (USD)',
};

type ReviewerKey = keyof ReviewerFile;
const REVIEWER_FIELDS: Array<{ key: ReviewerKey; label: string; hint: (locked: number) => string }> = [
  { key: 'minCheckHours', label: 'Minimum hours between reviews', hint: (l) => `At least ${l}. Raising it makes Proba wait longer before looking again.` },
  { key: 'maxCheckHours', label: 'Maximum hours between reviews', hint: (l) => `At most ${l}. Lowering it makes Proba look at least this often.` },
  { key: 'maxAutoChangePct', label: 'Largest automatic change (%)', hint: (l) => `At most ${l}%. Bigger budget moves always need your approval.` },
];

interface CreativeForm {
  maxHeadlineChars: string;
  maxBodyChars: string;
  bannedPhrases: string;
}

function reviewerForm(file: ReviewerFile | null | undefined): Record<ReviewerKey, string> {
  return {
    minCheckHours: file?.minCheckHours === undefined ? '' : String(file.minCheckHours),
    maxCheckHours: file?.maxCheckHours === undefined ? '' : String(file.maxCheckHours),
    maxAutoChangePct: file?.maxAutoChangePct === undefined ? '' : String(file.maxAutoChangePct),
  };
}

function creativeForm(file: CreativeFile | null | undefined): CreativeForm {
  return {
    maxHeadlineChars: file?.maxHeadlineChars === undefined ? '' : String(file.maxHeadlineChars),
    maxBodyChars: file?.maxBodyChars === undefined ? '' : String(file.maxBodyChars),
    bannedPhrases: (file?.bannedPhrases ?? []).join('\n'),
  };
}

function formatCeiling(value: number | null | undefined): string {
  if (value === null) return 'No deployment cap';
  if (value === undefined) return 'Not set';
  return String(value);
}

export function GuardrailsView() {
  const api = useGatewayApi();
  const [snapshot, setSnapshot] = useState<GuardrailsSnapshot | null>(null);
  const [limits, setLimits] = useState<Partial<Record<GuardrailLimitKey, string>>>({});
  const [verbs, setVerbs] = useState<Record<string, VerbMode | ''>>({});
  const [reviewer, setReviewer] = useState<Record<ReviewerKey, string>>(reviewerForm(null));
  const [creative, setCreative] = useState<CreativeForm>(creativeForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.getGuardrails();
      setSnapshot(next);
      setLimits(Object.fromEntries(GUARDRAIL_LIMIT_KEYS.map((key) => [key, next.fileLimits[key] === undefined ? '' : String(next.fileLimits[key])])));
      setVerbs(Object.fromEntries(next.verbs.map((verb) => [verb.name, verb.file ?? ''])));
      setReviewer(reviewerForm(next.reviewer?.file));
      setCreative(creativeForm(next.creative?.file));
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // The gateway client is stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const envTightened = useMemo(() => {
    if (!snapshot) return false;
    if (Object.keys(snapshot.envLimits).length > 0) return true;
    return snapshot.verbs.some((verb) => verb.env);
  }, [snapshot]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!snapshot || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const body: GuardrailsWrite = { verbs: {}, limits: {} };
    for (const [name, mode] of Object.entries(verbs)) {
      if (mode) body.verbs[name] = mode;
    }
    for (const key of GUARDRAIL_LIMIT_KEYS) {
      const raw = (limits[key] ?? '').trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        setSaving(false);
        setError(new ApiError('invalid_request', `${LIMIT_LABELS[key]} must be a positive number.`));
        return;
      }
      body.limits[key] = value;
    }
    // The write replaces the whole file, so the creative and reviewer blocks are always sent back (when the gateway has them).
    if (snapshot.reviewer) {
      const out: ReviewerFile = {};
      for (const field of REVIEWER_FIELDS) {
        const raw = reviewer[field.key].trim();
        if (!raw) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
          setSaving(false);
          setError(new ApiError('invalid_request', `${field.label} must be a positive number.`));
          return;
        }
        out[field.key] = value;
      }
      if (Object.keys(out).length > 0) body.reviewer = out;
    }
    if (snapshot.creative) {
      const out: CreativeFile = {};
      for (const key of ['maxHeadlineChars', 'maxBodyChars'] as const) {
        const raw = creative[key].trim();
        if (!raw) continue;
        const value = Number(raw);
        if (!Number.isInteger(value) || value <= 0) {
          setSaving(false);
          setError(new ApiError('invalid_request', `${key === 'maxHeadlineChars' ? 'Headline' : 'Body'} limit must be a whole positive number.`));
          return;
        }
        out[key] = value;
      }
      const phrases = creative.bannedPhrases.split('\n').map((p) => p.trim()).filter(Boolean);
      if (phrases.length > 0) out.bannedPhrases = phrases;
      if (Object.keys(out).length > 0) body.creative = out;
    }
    try {
      const next = await api.putGuardrails(body);
      setSnapshot(next);
      setLimits(Object.fromEntries(GUARDRAIL_LIMIT_KEYS.map((key) => [key, next.fileLimits[key] === undefined ? '' : String(next.fileLimits[key])])));
      setVerbs(Object.fromEntries(next.verbs.map((verb) => [verb.name, verb.file ?? ''])));
      setReviewer(reviewerForm(next.reviewer?.file));
      setCreative(creativeForm(next.creative?.file));
      setNotice('Guardrails saved. New runs use these ceilings. This change is in the audit trail.');
    } catch (err) {
      setError(isApiError(err) ? err : new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading guardrails">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Shield className="h-6 w-6" />}
          title="Guardrails could not be loaded"
          description={error.message}
          action={
            <Button onClick={() => void load()} variant="outline">
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <form onSubmit={submit} className="space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Guardrails"
        description="These settings can only tighten what the gateway code and the deployment already allow. They cannot raise a ceiling or enable a verb the code has locked."
        actions={
          <Button type="submit" disabled={saving || !snapshot.writable} loading={saving}>
            Save guardrails
          </Button>
        }
      />

      {!snapshot.writable && (
        <Callout tone="warning" title="Editing is not enabled on this gateway">
          The gateway has no writable override file. Set GATEWAY_GUARDRAILS_FILE to a file the process can write, then reload the gateway.
        </Callout>
      )}

      {envTightened && (
        <Callout tone="info" title="Environment overrides are still in force">
          GATEWAY_VERB_POLICY and GATEWAY_GUARDRAIL_MAX_* can only tighten this file further. Saving a looser file value will not raise an environment ceiling.
        </Callout>
      )}

      {notice && (
        <Callout tone="success" title="Saved" role="status">
          {notice}
        </Callout>
      )}

      {error && (
        <Callout tone="danger" title="The change was not saved" role="alert">
          {error.message}
        </Callout>
      )}

      <Card>
        <CardHeader
          titleAs="h2"
          title="Run ceilings"
          description="Leave a field empty to use the deployment limit only. A value may not exceed the locked ceiling."
        />
        <CardBody className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {GUARDRAIL_LIMIT_KEYS.map((key) => {
            const locked = snapshot.lockedLimits[key];
            return (
              <div key={key}>
                <Label htmlFor={`limit-${key}`}>{LIMIT_LABELS[key]}</Label>
                <Input
                  id={`limit-${key}`}
                  inputMode="decimal"
                  value={limits[key] ?? ''}
                  disabled={!snapshot.writable || saving}
                  aria-describedby={`limit-${key}-hint`}
                  onChange={(e) => setLimits((current) => ({ ...current, [key]: e.target.value }))}
                  placeholder={locked === null ? 'No cap' : `At most ${locked}`}
                />
                <FieldHint id={`limit-${key}-hint`}>
                  Locked maximum: {formatCeiling(locked)}. Effective now: {formatCeiling(snapshot.effectiveLimits[key] ?? locked)}
                  {snapshot.envLimits[key] !== undefined ? `. Environment: ${snapshot.envLimits[key]}` : ''}
                </FieldHint>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {snapshot.reviewer && (
        <Card>
          <CardHeader
            titleAs="h2"
            title="Campaign reviewer"
            description="Proba decides when to review a live campaign and what to change. These are the outer bounds it must stay within. Leave a field empty to use the code lock."
          />
          <CardBody className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {REVIEWER_FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={`reviewer-${field.key}`}>{field.label}</Label>
                <Input
                  id={`reviewer-${field.key}`}
                  inputMode="decimal"
                  value={reviewer[field.key]}
                  disabled={!snapshot.writable || saving}
                  aria-describedby={`reviewer-${field.key}-hint`}
                  onChange={(e) => setReviewer((current) => ({ ...current, [field.key]: e.target.value }))}
                  placeholder={String(snapshot.reviewer!.locked[field.key])}
                />
                <FieldHint id={`reviewer-${field.key}-hint`}>
                  {field.hint(snapshot.reviewer!.locked[field.key])} Effective now: {snapshot.reviewer!.effective[field.key]}.
                </FieldHint>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {snapshot.creative && (
        <Card>
          <CardHeader
            titleAs="h2"
            title="Post copy checks"
            description="Limits for the Reddit posts Proba drafts. You can lower the length caps and add banned phrases. The built-in banned list always applies."
          />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="creative-headline">Headline length cap</Label>
              <Input
                id="creative-headline"
                inputMode="numeric"
                value={creative.maxHeadlineChars}
                disabled={!snapshot.writable || saving}
                aria-describedby="creative-headline-hint"
                onChange={(e) => setCreative((current) => ({ ...current, maxHeadlineChars: e.target.value }))}
                placeholder={`At most ${snapshot.creative.locked.maxHeadlineChars}`}
              />
              <FieldHint id="creative-headline-hint">Locked maximum: {snapshot.creative.locked.maxHeadlineChars} characters.</FieldHint>
            </div>
            <div>
              <Label htmlFor="creative-body">Body length cap</Label>
              <Input
                id="creative-body"
                inputMode="numeric"
                value={creative.maxBodyChars}
                disabled={!snapshot.writable || saving}
                aria-describedby="creative-body-hint"
                onChange={(e) => setCreative((current) => ({ ...current, maxBodyChars: e.target.value }))}
                placeholder={`At most ${snapshot.creative.locked.maxBodyChars}`}
              />
              <FieldHint id="creative-body-hint">Locked maximum: {snapshot.creative.locked.maxBodyChars} characters.</FieldHint>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="creative-banned">Extra banned phrases (one per line)</Label>
              <textarea
                id="creative-banned"
                className="mt-1 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-body"
                value={creative.bannedPhrases}
                disabled={!snapshot.writable || saving}
                aria-describedby="creative-banned-hint"
                onChange={(e) => setCreative((current) => ({ ...current, bannedPhrases: e.target.value }))}
              />
              <FieldHint id="creative-banned-hint">Always banned: {snapshot.creative.locked.bannedPhrases.join(', ')}.</FieldHint>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          titleAs="h2"
          title="Verb policy"
          description="Allow, ask (approval) or deny, within the code lock. A verb the code has denied cannot be opened here."
        />
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-left text-body">
            <thead className="border-b bg-surface-sunken/60 text-caption font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Verb</th>
                <th className="px-5 py-3 font-medium">Code lock</th>
                <th className="px-5 py-3 font-medium">Effective</th>
                <th className="px-5 py-3 font-medium">File setting</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.verbs.map((verb) => {
                const lockedOnly = verb.allowedModes.length === 1;
                return (
                  <tr key={verb.name} className="border-b last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{verb.name}</td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">{verb.locked}</td>
                    <td className="px-5 py-3 capitalize text-foreground">{verb.effective}</td>
                    <td className="px-5 py-3">
                      <NativeSelect
                        aria-label={`Policy for ${verb.name}`}
                        value={verbs[verb.name] ?? ''}
                        disabled={!snapshot.writable || saving || lockedOnly}
                        onChange={(e) => setVerbs((current) => ({ ...current, [verb.name]: e.target.value as VerbMode | '' }))}
                      >
                        <option value="">Default ({verb.locked})</option>
                        {verb.allowedModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </form>
  );
}
