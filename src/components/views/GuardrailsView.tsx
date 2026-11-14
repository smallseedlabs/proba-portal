import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Shield } from 'lucide-react';
import { ApiError, isApiError } from '../../lib/api/errors';
import type { GuardrailLimitKey, GuardrailsSnapshot, GuardrailsWrite, VerbMode } from '../../lib/gateway/schemas';
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
    try {
      const next = await api.putGuardrails(body);
      setSnapshot(next);
      setLimits(Object.fromEntries(GUARDRAIL_LIMIT_KEYS.map((key) => [key, next.fileLimits[key] === undefined ? '' : String(next.fileLimits[key])])));
      setVerbs(Object.fromEntries(next.verbs.map((verb) => [verb.name, verb.file ?? ''])));
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
