/**
 * proba-in-memory-gateway-adapter
 * In-memory source for the automated browser checks only. Not included in production builds.
 */
import { ApiError } from '../../api/errors';
import type { CallOptions, GatewayApi } from '../port';
import type { GuardrailsSnapshot, GuardrailsWrite, VerbMode } from '../schemas';

const STRICTNESS: Record<VerbMode, number> = { allow: 0, ask: 1, deny: 2 };

const DEFAULT_VERBS: GuardrailsSnapshot['verbs'] = [
  { name: 'research.gather', locked: 'allow', file: null, env: null, effective: 'allow', allowedModes: ['allow', 'ask', 'deny'] },
  { name: 'research.accept', locked: 'allow', file: null, env: null, effective: 'allow', allowedModes: ['allow', 'ask', 'deny'] },
  { name: 'page.attach_user_page', locked: 'allow', file: null, env: null, effective: 'allow', allowedModes: ['allow', 'ask', 'deny'] },
  { name: 'page.generate_page', locked: 'deny', file: null, env: null, effective: 'deny', allowedModes: ['deny'] },
  { name: 'ads.create_campaign', locked: 'ask', file: null, env: null, effective: 'ask', allowedModes: ['ask', 'deny'] },
  { name: 'ads.update_campaign', locked: 'ask', file: null, env: null, effective: 'ask', allowedModes: ['ask', 'deny'] },
  { name: 'ads.pause_campaign', locked: 'ask', file: null, env: null, effective: 'ask', allowedModes: ['ask', 'deny'] },
  { name: 'ads.move_budget', locked: 'deny', file: null, env: null, effective: 'deny', allowedModes: ['deny'] },
  { name: 'ads.resume_campaign', locked: 'ask', file: null, env: null, effective: 'ask', allowedModes: ['ask', 'deny'] },
  { name: 'analytics.compare_metrics', locked: 'deny', file: null, env: null, effective: 'deny', allowedModes: ['deny'] },
];

function seed(): GuardrailsSnapshot {
  return {
    schema: 'proba.gateway-guardrails/v1-effective',
    fileVersion: '2026-11-14.1',
    version: '2026-11-14.1',
    source: 'memory',
    writable: true,
    lockedLimits: {
      maxIterations: 8,
      maxLlmCalls: 8,
      maxToolCalls: 16,
      maxPromptTokens: null,
      maxCompletionTokens: null,
      maxTotalTokens: 8000,
      maxCostUsd: null,
    },
    fileLimits: {},
    envLimits: {},
    effectiveLimits: {},
    verbs: DEFAULT_VERBS.map((v) => ({ ...v })),
    creative: { locked: { maxHeadlineChars: 300, maxBodyChars: 10000, bannedPhrases: ['guarantee', 'risk-free', '100%'] }, file: null },
    reviewer: {
      locked: { minCheckHours: 1, maxCheckHours: 168, maxAutoChangePct: 20 },
      file: null,
      effective: { minCheckHours: 1, maxCheckHours: 168, maxAutoChangePct: 20 },
    },
  };
}

export interface InMemoryGatewayApiOptions {
  role?: 'admin' | 'viewer';
  latencyMs?: number;
}

export class InMemoryGatewayApi implements GatewayApi {
  private snapshot: GuardrailsSnapshot;
  private readonly role: 'admin' | 'viewer';
  private readonly latencyMs: number;
  writes = 0;

  constructor(options: InMemoryGatewayApiOptions = {}) {
    this.snapshot = seed();
    this.role = options.role ?? 'admin';
    this.latencyMs = options.latencyMs ?? 0;
  }

  private async gate<T>(run: () => T): Promise<T> {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    if (this.role !== 'admin') throw new ApiError('forbidden', "Your account doesn't have access to this.", { status: 403 });
    return run();
  }

  getGuardrails(_options?: CallOptions) {
    return this.gate(() => structuredClone(this.snapshot));
  }

  putGuardrails(body: GuardrailsWrite, _options?: CallOptions) {
    return this.gate(() => {
      for (const [name, mode] of Object.entries(body.verbs ?? {})) {
        const verb = this.snapshot.verbs.find((v) => v.name === name);
        if (!verb) throw new ApiError('invalid_request', `unknown verb "${name}"`, { status: 400, code: 'guardrails_rejected' });
        if (STRICTNESS[mode] < STRICTNESS[verb.locked]) {
          throw new ApiError('invalid_request', `"${name}=${mode}" would loosen the code lock (${verb.locked}); guardrails can only tighten`, {
            status: 400,
            code: 'guardrails_rejected',
          });
        }
      }
      for (const [key, value] of Object.entries(body.limits ?? {})) {
        const locked = this.snapshot.lockedLimits[key as keyof GuardrailsSnapshot['lockedLimits']];
        if (typeof value === 'number' && locked !== null && value > locked) {
          throw new ApiError('invalid_request', `${key}=${value} would loosen the deployment limit GATEWAY_MAX_* (${locked}); guardrails can only tighten`, {
            status: 400,
            code: 'guardrails_rejected',
          });
        }
      }
      const lockedReviewer = this.snapshot.reviewer?.locked ?? { minCheckHours: 1, maxCheckHours: 168, maxAutoChangePct: 20 };
      const r = body.reviewer;
      const loosen = (msg: string) => {
        throw new ApiError('invalid_request', `${msg}; guardrails can only tighten`, { status: 400, code: 'guardrails_rejected' });
      };
      if (r?.minCheckHours !== undefined && r.minCheckHours < lockedReviewer.minCheckHours) loosen(`reviewer.minCheckHours=${r.minCheckHours} would loosen the code lock (${lockedReviewer.minCheckHours})`);
      if (r?.maxCheckHours !== undefined && r.maxCheckHours > lockedReviewer.maxCheckHours) loosen(`reviewer.maxCheckHours=${r.maxCheckHours} would loosen the code lock (${lockedReviewer.maxCheckHours})`);
      if (r?.maxAutoChangePct !== undefined && r.maxAutoChangePct > lockedReviewer.maxAutoChangePct) loosen(`reviewer.maxAutoChangePct=${r.maxAutoChangePct} would loosen the code lock (${lockedReviewer.maxAutoChangePct})`);
      const c = body.creative;
      const lockedCreative = this.snapshot.creative?.locked;
      if (lockedCreative && c?.maxHeadlineChars !== undefined && c.maxHeadlineChars > lockedCreative.maxHeadlineChars) loosen(`creative.maxHeadlineChars=${c.maxHeadlineChars} would loosen the code lock (${lockedCreative.maxHeadlineChars})`);
      if (lockedCreative && c?.maxBodyChars !== undefined && c.maxBodyChars > lockedCreative.maxBodyChars) loosen(`creative.maxBodyChars=${c.maxBodyChars} would loosen the code lock (${lockedCreative.maxBodyChars})`);
      const fileLimits = { ...(body.limits ?? {}) };
      const verbs = this.snapshot.verbs.map((verb) => {
        const file = body.verbs?.[verb.name] ?? null;
        const effective = file && STRICTNESS[file] > STRICTNESS[verb.locked] ? file : verb.locked;
        return { ...verb, file, effective };
      });
      this.snapshot = {
        ...this.snapshot,
        fileVersion: body.version ?? '2026-11-14.portal',
        version: body.version ?? '2026-11-14.portal',
        fileLimits,
        effectiveLimits: { ...fileLimits },
        verbs,
        ...(this.snapshot.creative ? { creative: { ...this.snapshot.creative, file: c ?? null } } : {}),
        ...(this.snapshot.reviewer
          ? {
              reviewer: {
                locked: lockedReviewer,
                file: r ?? null,
                effective: {
                  minCheckHours: Math.max(lockedReviewer.minCheckHours, r?.minCheckHours ?? 0),
                  maxCheckHours: Math.min(lockedReviewer.maxCheckHours, r?.maxCheckHours ?? Infinity),
                  maxAutoChangePct: Math.min(lockedReviewer.maxAutoChangePct, r?.maxAutoChangePct ?? Infinity),
                },
              },
            }
          : {}),
      };
      this.writes += 1;
      return structuredClone(this.snapshot);
    });
  }
}
