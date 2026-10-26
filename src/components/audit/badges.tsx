import { CircleAlert, CircleCheck, CircleDashed, CircleSlash, ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import type { AuditOutcome, AuditRiskLevel } from '../../lib/api/schemas';
import { OUTCOME_LABELS, RISK_LABELS } from '../../lib/labels';
import { Badge, type Tone } from '../ui/badge';

const OUTCOME_TONE: Record<AuditOutcome, Tone> = { success: 'success', failure: 'danger', denied: 'warning', partial: 'info' };
const OUTCOME_ICON = {
  success: CircleCheck,
  failure: CircleAlert,
  denied: CircleSlash,
  partial: CircleDashed,
} as const;

/** The outcome is always written out and has an icon: it is never conveyed by colour alone. */
export function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  const Icon = OUTCOME_ICON[outcome];
  return (
    <Badge tone={OUTCOME_TONE[outcome]} data-outcome={outcome}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {OUTCOME_LABELS[outcome]}
    </Badge>
  );
}

const RISK_TONE: Record<AuditRiskLevel, Tone> = { low: 'neutral', medium: 'warning', high: 'danger' };
const RISK_ICON = { low: ShieldCheck, medium: Shield, high: ShieldAlert } as const;

export function RiskBadge({ risk }: { risk: AuditRiskLevel | undefined }) {
  if (!risk) return <span className="text-muted-foreground">—</span>;
  const Icon = RISK_ICON[risk];
  return (
    <Badge tone={RISK_TONE[risk]} data-risk={risk}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {RISK_LABELS[risk]}
    </Badge>
  );
}
