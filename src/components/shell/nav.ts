import { BarChart3, Brain, Briefcase, GitBranch, Microscope, ScrollText, ShieldCheck, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { Section } from '../../lib/router';

export interface NavEntry {
  section: Section;
  label: string;
  icon: LucideIcon;
  /** Only for administrators. */
  adminOnly?: boolean;
  /** Part of the memory feature: shown only when MEMORY_URL is configured. */
  group?: 'memory';
}

export const NAV_ENTRIES: NavEntry[] = [
  { section: 'explorer', label: 'Audit Explorer', icon: ScrollText },
  { section: 'traces', label: 'Traces', icon: GitBranch },
  { section: 'integrity', label: 'Integrity', icon: ShieldCheck, adminOnly: true },
  { section: 'analytics', label: 'Analytics', icon: BarChart3 },
  { section: 'memory', label: 'Memory Explorer', icon: Brain, group: 'memory' },
  { section: 'retrievals', label: 'Retrieval Inspector', icon: Microscope, adminOnly: true, group: 'memory' },
  { section: 'profiles', label: 'Scoring profiles', icon: SlidersHorizontal, group: 'memory' },
  { section: 'jobs', label: 'Jobs', icon: Briefcase, adminOnly: true, group: 'memory' },
];

export const SECTION_TITLES: Record<Section, string> = {
  explorer: 'Audit Explorer',
  traces: 'Traces',
  integrity: 'Integrity',
  analytics: 'Analytics',
  memory: 'Memory Explorer',
  retrievals: 'Retrieval Inspector',
  profiles: 'Scoring profiles',
  jobs: 'Jobs',
};

/** The entries a person may see: administrator-only ones need the role, memory ones need the feature. */
export function visibleEntries(options: { admin: boolean; memory: boolean }): NavEntry[] {
  return NAV_ENTRIES.filter((e) => (!e.adminOnly || options.admin) && (e.group !== 'memory' || options.memory));
}
