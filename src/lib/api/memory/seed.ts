import type { AuditContent, AuditEventRecord, CampaignTotals, MetricsTotals } from '../schemas';

/**
 * Deterministic fixture data for the in-memory adapter, which is used only by the automated tests
 * (unit and browser). It is compiled into the browser-check build alone: production builds exclude it.
 */
export const PROBA_IN_MEMORY_ADAPTER_MARKER = 'proba-in-memory-adapter';

export const WORKSPACE_ID = 'ws_northwind';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small deterministic PRNG so every run sees the same data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(rand: () => number, length: number): string {
  let out = '';
  while (out.length < length) out += Math.floor(rand() * 16).toString(16);
  return out;
}

function uuid(rand: () => number): string {
  const h = hex(rand, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface SeedCampaign {
  campaignId: string;
  platform: string;
  accountId: string;
  currency: string;
  /** Rough hourly impressions at peak. */
  scale: number;
  ctr: number;
  cvr: number;
  cpm: number;
}

export const SEED_CAMPAIGNS: SeedCampaign[] = [
  { campaignId: 'cmp_spring_launch', platform: 'google_ads', accountId: '482-117-9034', currency: 'USD', scale: 5200, ctr: 0.031, cvr: 0.042, cpm: 9.4 },
  { campaignId: 'cmp_retarget_q4', platform: 'meta', accountId: 'act_2210984', currency: 'USD', scale: 3600, ctr: 0.018, cvr: 0.061, cpm: 7.1 },
  { campaignId: 'cmp_brand_search', platform: 'google_ads', accountId: '482-117-9034', currency: 'USD', scale: 1800, ctr: 0.074, cvr: 0.083, cpm: 14.8 },
  { campaignId: 'cmp_emea_awareness', platform: 'linkedin', accountId: 'li_50419', currency: 'EUR', scale: 2400, ctr: 0.009, cvr: 0.014, cpm: 11.6 },
  { campaignId: 'cmp_newsletter_growth', platform: 'meta', accountId: 'act_2210984', currency: 'USD', scale: 900, ctr: 0.022, cvr: 0.035, cpm: 5.2 },
];

export interface SeedMetricRow extends Omit<MetricsTotals, 'ctr' | 'cpc' | 'cpm' | 'cpa' | 'roas'> {
  hour: number;
  campaignId: string;
  platform: string;
  accountId: string;
}

/** Hourly delivery for the last `days` days, ending at the hour before `now`. */
export function seedMetrics(now: number, days = 190): SeedMetricRow[] {
  const rand = mulberry32(7);
  const end = Math.floor(now / HOUR) * HOUR;
  const rows: SeedMetricRow[] = [];
  for (const c of SEED_CAMPAIGNS) {
    for (let t = end - days * DAY; t < end; t += HOUR) {
      const hourOfDay = new Date(t).getUTCHours();
      const weekday = new Date(t).getUTCDay();
      const daily = 0.35 + 0.65 * Math.max(0, Math.sin(((hourOfDay - 5) / 24) * Math.PI * 2 * 0.5 + 0.2));
      const weekly = weekday === 0 || weekday === 6 ? 0.72 : 1;
      // Campaigns ramp up over time so period comparisons show real movement.
      const ramp = 0.8 + 0.4 * ((t - (end - days * DAY)) / (days * DAY));
      const impressions = Math.round(c.scale * daily * weekly * ramp * (0.85 + rand() * 0.3));
      const clicks = Math.round(impressions * c.ctr * (0.85 + rand() * 0.3));
      const conversions = Math.round(clicks * c.cvr * (0.7 + rand() * 0.6));
      const spend = Math.round(((impressions / 1000) * c.cpm * (0.9 + rand() * 0.2)) * 100) / 100;
      rows.push({
        hour: t,
        campaignId: c.campaignId,
        platform: c.platform,
        accountId: c.accountId,
        currency: c.currency,
        impressions,
        clicks,
        spend,
        conversions,
        revenue: Math.round(conversions * (38 + rand() * 20) * 100) / 100,
        observationCount: 1,
      });
    }
  }
  return rows;
}

export type { CampaignTotals };

interface SpanSpec {
  key: string;
  parent?: string;
  service: string;
  action: string;
  category: AuditEventRecord['category'];
  actor: AuditEventRecord['actor'];
  at: number;
  durationMs?: number;
  outcome?: AuditEventRecord['outcome'];
  risk?: AuditEventRecord['riskLevel'];
  target?: AuditEventRecord['target'];
  errorCode?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
  cost?: AuditEventRecord['cost'];
  /** Raw text of the step, as the administrator-only content routes return it. */
  content?: AuditContent;
}

/** Text shapes used by the fixture data: a masked secret, a long message that was cut, and plain text. */
const USER_MESSAGES = [
  'Raise the daily budget of the spring launch campaign to 6,500 and tell me what changes.',
  'Pause the retargeting campaign until Thursday and summarise how it performed this week.',
  'Create an ad set for the newsletter growth campaign targeting existing subscribers in Germany.',
  'Sync audiences for the brand search campaign. Use the credential [REDACTED:api_key] if the platform asks again.',
  'Why did spend on the EMEA awareness campaign fall on Tuesday? Compare it with the previous week.',
];

function userMessage(index: number): AuditContent {
  if (index % 11 === 4) {
    const text = `Please review these notes for the quarterly plan and update every campaign accordingly. ${'Prioritise efficiency over reach where the cost per acquisition is above target. '.repeat(40)}`.slice(0, 2000);
    return { kind: 'user_message', text, truncated: true, originalLength: 18_250, redactions: 0 };
  }
  const text = USER_MESSAGES[index % USER_MESSAGES.length]!;
  return { kind: 'user_message', text, truncated: false, originalLength: text.length, redactions: text.includes('[REDACTED') ? 1 : 0 };
}

const BRAIN_REPLY: AuditContent = {
  kind: 'brain_reply',
  text: 'Done. The campaign is paused and will stay paused until you resume it. Its delivery over the last seven days is summarised in the thread.',
  truncated: false,
  originalLength: 137,
  redactions: 0,
};

const DENIAL_EXPLANATION: AuditContent = {
  kind: 'explanation',
  text: 'The requested daily budget of 12,000 is above the workspace limit of 5,000, so the change was not applied. An administrator can raise the limit or approve an exception.',
  truncated: false,
  originalLength: 164,
  redactions: 0,
};

const USERS = ['usr_amelia_frost', 'usr_dev_patel', 'usr_noor_haddad'];

function hashOf(rand: () => number): string {
  return hex(rand, 64);
}

/**
 * Audit events for ~7 days: user commands that become plans and tool calls (some needing approval,
 * some denied or failing), background metric syncs, policy checks and data access.
 * Sorted oldest first and chained by ingestion order like the real store.
 */
export function seedEvents(now: number): { events: AuditEventRecord[]; tamperedEventId: string; contents: Map<string, AuditContent> } {
  const rand = mulberry32(42);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
  const specs: Array<{ traceId: string; goalId?: string; threadId?: string; campaignId?: string; spans: SpanSpec[] }> = [];

  const traceCount = 64;
  for (let i = 0; i < traceCount; i++) {
    // Denser in the most recent day so the default range is never empty.
    const ageHours = i < 28 ? rand() * 22 + 0.3 : 24 + rand() * 6 * 24;
    const t0 = now - ageHours * HOUR;
    const traceId = uuid(rand);
    const goalId = uuid(rand);
    const threadId = uuid(rand);
    const user = pick(USERS);
    const campaign = pick(SEED_CAMPAIGNS).campaignId;
    const kind = i % 8;
    const actor = { type: 'user' as const, id: user };
    const brain = { type: 'brain' as const, id: 'proba-brain' };
    const hub = { type: 'service' as const, id: 'proba-hub' };
    const tools = { type: 'service' as const, id: 'proba-tools' };
    const spans: SpanSpec[] = [
      { key: 'cmd', service: 'proba-hub', action: 'command.received', category: 'command', actor, at: t0, durationMs: 18, details: { channel: 'web', commandType: 'send_message' }, content: userMessage(i) },
      { key: 'plan', parent: 'cmd', service: 'proba-brain', action: 'brain.plan_created', category: 'brain', actor: brain, at: t0 + 40, durationMs: 2100, details: { steps: 4 } },
      { key: 'llm', parent: 'plan', service: 'proba-brain', action: 'brain.llm_call', category: 'brain', actor: brain, at: t0 + 90, durationMs: 1750, cost: { tokensIn: 3120, tokensOut: 640, currency: 'USD', amount: 0.0214 }, details: { purpose: 'planning' } },
      { key: 'policy', parent: 'plan', service: 'proba-hub', action: 'policy.evaluated', category: 'policy', actor: hub, at: t0 + 2200, durationMs: 31, details: { policy: 'spend_limits' } },
    ];
    if (kind === 0 || kind === 1 || kind === 5) {
      spans.push(
        { key: 'appr', parent: 'policy', service: 'proba-hub', action: 'approval.requested', category: 'approval', actor: hub, at: t0 + 2300, durationMs: 12, risk: 'medium', details: { reason: 'budget above autonomous limit' } },
        { key: 'appg', parent: 'appr', service: 'proba-hub', action: 'approval.granted', category: 'approval', actor, at: t0 + 2300 + 4 * 60_000, durationMs: 9, risk: 'medium' },
        { key: 'tool', parent: 'appg', service: 'proba-tools', action: 'tool.executed', category: 'tool', actor: tools, at: t0 + 2300 + 4 * 60_000 + 200, durationMs: 1260, risk: 'medium', target: { type: 'campaign', id: campaign }, details: { tool: 'google_ads.update_budget' } },
        { key: 'done', parent: 'cmd', service: 'proba-hub', action: 'command.processed', category: 'command', actor: hub, at: t0 + 2300 + 4 * 60_000 + 1600, durationMs: 6 }
      );
    } else if (kind === 2) {
      spans.push(
        { key: 'deny', parent: 'policy', service: 'proba-hub', action: 'policy.denied', category: 'policy', actor: hub, at: t0 + 2300, durationMs: 8, outcome: 'denied', risk: 'high', target: { type: 'campaign', id: campaign }, errorCode: 'budget_limit_exceeded', errorMessage: 'The requested daily budget is above the workspace limit.', details: { limit: 5000, requested: 12000 }, content: DENIAL_EXPLANATION },
        { key: 'done', parent: 'cmd', service: 'proba-hub', action: 'command.processed', category: 'command', actor: hub, at: t0 + 2400, durationMs: 5, outcome: 'denied' }
      );
    } else if (kind === 3) {
      spans.push(
        { key: 'tool', parent: 'policy', service: 'proba-tools', action: 'tool.failed', category: 'tool', actor: tools, at: t0 + 2300, durationMs: 4800, outcome: 'failure', risk: 'medium', target: { type: 'campaign', id: campaign }, errorCode: 'platform_rate_limited', errorMessage: 'The ad platform rejected the request: too many requests.', details: { tool: 'meta.create_adset', attempts: 3 } },
        { key: 'sys', parent: 'cmd', service: 'proba-hub', action: 'command.processed', category: 'command', actor: hub, at: t0 + 7200, durationMs: 6, outcome: 'failure', errorCode: 'tool_failed' }
      );
    } else if (kind === 4) {
      spans.push(
        { key: 'tool', parent: 'policy', service: 'proba-tools', action: 'tool.executed', category: 'tool', actor: tools, at: t0 + 2300, durationMs: 940, outcome: 'partial', risk: 'low', target: { type: 'campaign', id: campaign }, details: { tool: 'google_ads.sync_audiences', applied: 3, skipped: 1 } },
        { key: 'orph', parent: 'missing-parent', service: 'proba-metrics', action: 'metrics.fetch_completed', category: 'metrics', actor: { type: 'service', id: 'proba-metrics' }, at: t0 + 3500, durationMs: 610, target: { type: 'campaign', id: campaign } }
      );
    } else {
      spans.push(
        { key: 'tool', parent: 'policy', service: 'proba-tools', action: 'tool.executed', category: 'tool', actor: tools, at: t0 + 2300, durationMs: 780, risk: 'low', target: { type: 'campaign', id: campaign }, details: { tool: 'google_ads.pause_campaign' } },
        ...(kind === 6 ? [{ key: 'reply', parent: 'tool', service: 'proba-brain', action: 'brain.reply_generated', category: 'brain' as const, actor: brain, at: t0 + 3000, durationMs: 150, content: BRAIN_REPLY }] : []),
        { key: 'done', parent: 'cmd', service: 'proba-hub', action: 'command.processed', category: 'command', actor: hub, at: t0 + 3200, durationMs: 6 }
      );
    }
    specs.push({ traceId, goalId, threadId, campaignId: campaign, spans });
  }

  // Background work: metric syncs and rollups every few hours, and people reading the audit trail.
  for (let h = 1; h < 150; h += 3) {
    const t0 = now - h * HOUR - Math.floor(rand() * 20) * 60_000;
    const traceId = uuid(rand);
    const campaign = pick(SEED_CAMPAIGNS).campaignId;
    const failed = h % 37 === 1;
    specs.push({
      traceId,
      campaignId: campaign,
      spans: [
        { key: 'job', service: 'proba-metrics', action: 'system.job_run', category: 'system', actor: { type: 'system', id: 'scheduler' }, at: t0, durationMs: failed ? 900 : 5400, outcome: failed ? 'failure' : 'success', details: { job: 'metrics_sync' }, ...(failed ? { errorCode: 'upstream_timeout', errorMessage: 'The platform did not respond in time.' } : {}) },
        { key: 'fetch', parent: 'job', service: 'proba-metrics', action: failed ? 'metrics.fetch_failed' : 'metrics.fetch_completed', category: 'metrics', actor: { type: 'service', id: 'proba-metrics' }, at: t0 + 120, durationMs: failed ? 800 : 3100, outcome: failed ? 'failure' : 'success', target: { type: 'campaign', id: campaign } },
        ...(failed ? [] : [{ key: 'roll', parent: 'job', service: 'proba-metrics', action: 'metrics.rollup_run', category: 'metrics' as const, actor: { type: 'service' as const, id: 'proba-metrics' }, at: t0 + 3300, durationMs: 1900, details: { buckets: 24 } }]),
      ],
    });
  }
  for (let h = 2; h < 120; h += 5) {
    const t0 = now - h * HOUR - Math.floor(rand() * 40) * 60_000;
    specs.push({
      traceId: uuid(rand),
      spans: [
        { key: 'read', service: 'proba-audit', action: 'data_access.read', category: 'data_access', actor: { type: 'user', id: pick(USERS) }, at: t0, durationMs: 42, target: { type: 'audit_events', id: 'search' }, details: { route: 'GET /v1/events', results: 50 } },
      ],
    });
  }

  const events: AuditEventRecord[] = [];
  const contents = new Map<string, AuditContent>();
  // A separate generator so the text digests do not shift the rest of the fixture data.
  const digestRand = mulberry32(99);
  for (const spec of specs) {
    const spanIds = new Map<string, string>();
    for (const s of spec.spans) spanIds.set(s.key, hex(rand, 16).replace(/^0+$/, 'a1b2c3d4e5f60718'));
    for (const s of spec.spans) {
      const outcome = s.outcome ?? 'success';
      const parentSpanId = s.parent ? spanIds.get(s.parent) ?? '00f0f0f0f0f0f0f1' : undefined;
      const occurredAt = new Date(s.at).toISOString();
      const eventId = uuid(rand);
      if (s.content) contents.set(eventId, s.content);
      events.push({
        version: 1,
        eventId,
        traceId: spec.traceId,
        spanId: spanIds.get(s.key)!,
        ...(parentSpanId ? { parentSpanId } : {}),
        workspaceId: WORKSPACE_ID,
        ...(s.actor.type === 'user' ? { userId: uuid(rand) } : {}),
        ...(spec.goalId && s.category !== 'data_access' && s.category !== 'metrics' && s.category !== 'system' ? { goalId: spec.goalId, threadId: spec.threadId } : {}),
        ...(spec.campaignId ? { campaignId: spec.campaignId } : {}),
        actor: s.actor,
        service: s.service,
        action: s.action,
        category: s.category,
        ...(s.target ? { target: s.target } : {}),
        outcome,
        ...(s.errorCode ? { errorCode: s.errorCode } : {}),
        ...(s.errorMessage ? { errorMessage: s.errorMessage } : {}),
        ...(s.risk ? { riskLevel: s.risk } : {}),
        ...(s.cost ? { cost: s.cost } : {}),
        ...(s.durationMs !== undefined ? { durationMs: s.durationMs } : {}),
        occurredAt,
        details: s.details ?? {},
        tags: s.category === 'approval' ? ['needs-review'] : [],
        prevHash: null,
        hash: '',
        ingestedAt: new Date(s.at + 250).toISOString(),
        schemaVersion: 1,
        ...(s.content ? { hasContent: true as const, contentDigest: hex(digestRand, 64) } : {}),
      });
    }
  }

  // Chain by ingestion order.
  events.sort((a, b) => (a.ingestedAt < b.ingestedAt ? -1 : a.ingestedAt > b.ingestedAt ? 1 : a.eventId < b.eventId ? -1 : 1));
  let prev: string | null = null;
  for (const event of events) {
    event.prevHash = prev;
    event.hash = hashOf(rand);
    prev = event.hash;
  }
  // One record about 30 hours back does not match its stored hash: verifying "the previous 24 hours"
  // reports it, while the last 24 hours verify cleanly.
  const target = now - 30 * HOUR;
  const tampered = events.reduce((best, e) =>
    Math.abs(Date.parse(e.ingestedAt) - target) < Math.abs(Date.parse(best.ingestedAt) - target) ? e : best
  );
  return { events, tamperedEventId: tampered.eventId, contents };
}
