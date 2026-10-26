import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { InMemoryAuditApi, type InMemoryAuditApiOptions } from '../lib/api/memory/memory-audit-api';
import type { AuditApi } from '../lib/api/port';
import type { ApiSession } from '../lib/api/schemas';
import { ApiProvider } from '../state/api';

export const NOW = Date.parse('2026-10-26T12:30:00.000Z');

export function fixtureApi(options: InMemoryAuditApiOptions = {}): InMemoryAuditApi {
  return new InMemoryAuditApi({ now: () => NOW, ...options });
}

export function renderWithApi(
  ui: ReactElement,
  {
    api = fixtureApi(),
    role = 'admin',
    memoryUrl = null,
    onSessionExpired = vi.fn(),
    onSignOut = vi.fn(),
  }: { api?: AuditApi; role?: ApiSession['role']; memoryUrl?: string | null; onSessionExpired?: () => void; onSignOut?: () => void } = {}
) {
  const access: ApiSession = { subject: 's', email: 'amelia.frost@northwind.example', role, workspaceId: 'ws_northwind' };
  const result = render(
    <ApiProvider
      api={api}
      user={{ id: 'u', email: access.email, name: 'Amelia Frost' }}
      access={access}
      memoryUrl={memoryUrl}
      onSessionExpired={onSessionExpired}
      onSignOut={onSignOut}
    >
      {ui}
    </ApiProvider>
  );
  return { ...result, api, onSessionExpired, onSignOut };
}
