import { BarChart3, GitBranch, ScrollText, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { Section } from '../../lib/router';

export interface NavEntry {
  section: Section;
  label: string;
  icon: LucideIcon;
  /** Only for administrators. */
  adminOnly?: boolean;
}

export const NAV_ENTRIES: NavEntry[] = [
  { section: 'explorer', label: 'Audit Explorer', icon: ScrollText },
  { section: 'traces', label: 'Traces', icon: GitBranch },
  { section: 'integrity', label: 'Integrity', icon: ShieldCheck, adminOnly: true },
  { section: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export const SECTION_TITLES: Record<Section, string> = {
  explorer: 'Audit Explorer',
  traces: 'Traces',
  integrity: 'Integrity',
  analytics: 'Analytics',
};
