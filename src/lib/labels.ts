import type { AuditActorType, AuditCategory, AuditOutcome, AuditRiskLevel } from './api/schemas';

export const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  success: 'Succeeded',
  failure: 'Failed',
  denied: 'Denied',
  partial: 'Partly completed',
};

export const RISK_LABELS: Record<AuditRiskLevel, string> = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
  command: 'Command',
  brain: 'Planning',
  tool: 'Tool',
  policy: 'Policy',
  approval: 'Approval',
  data_access: 'Data access',
  memory: 'Memory',
  metrics: 'Metrics',
  auth: 'Authentication',
  config: 'Configuration',
  system: 'System',
};

export const ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  user: 'Person',
  brain: 'Brain',
  system: 'System',
  service: 'Service',
};

/** "approval.requested" is shown as-is: it is the identifier people search for and quote. */
export function labelFor<T extends string>(labels: Record<T, string>, value: string): string {
  return (labels as Record<string, string>)[value] ?? value;
}

/** The recommended kinds of raw text (protocol AUDIT_CONTENT_KINDS). The set is open: other kinds are shown as readable words. */
export const CONTENT_KIND_LABELS: Record<string, string> = {
  user_message: 'Message from a person',
  brain_reply: 'Reply',
  brain_clarification: 'Clarifying question',
  explanation: 'Explanation',
  prompt: 'Model prompt',
};

export function contentKindLabel(kind: string): string {
  const known = CONTENT_KIND_LABELS[kind];
  if (known) return known;
  const words = kind.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Text';
}
