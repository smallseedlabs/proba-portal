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
