/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { InMemoryAuditApi, type InMemoryAuditApiOptions } from '../lib/api/memory/memory-audit-api';
import type { AuditApi } from '../lib/api/port';
import { InMemoryMemoryApi, type InMemoryMemoryApiOptions } from '../lib/memory/in-memory/in-memory-memory-api';
import type { MemoryApi } from '../lib/memory/port';
import type { ApiSession } from '../lib/api/schemas';
import { ApiProvider } from '../state/api';

export const NOW = Date.parse('2026-10-26T12:30:00.000Z');

export function fixtureApi(options: InMemoryAuditApiOptions = {}): InMemoryAuditApi {
  return new InMemoryAuditApi({ now: () => NOW, ...options });
}

export function fixtureMemoryApi(options: InMemoryMemoryApiOptions = {}): InMemoryMemoryApi {
  return new InMemoryMemoryApi({ now: () => NOW, ...options });
}

export function renderWithApi(
  ui: ReactElement,
  {
    api = fixtureApi(),
    role = 'admin',
    memory = null,
    onSessionExpired = vi.fn(),
    onSignOut = vi.fn(),
  }: { api?: AuditApi; role?: ApiSession['role']; memory?: MemoryApi | null; onSessionExpired?: () => void; onSignOut?: () => void } = {}
) {
  const access: ApiSession = { subject: 's', email: 'amelia.frost@northwind.example', role, workspaceId: 'ws_northwind' };
  const result = render(
    <ApiProvider
      api={api}
      user={{ id: 'u', email: access.email, name: 'Amelia Frost' }}
      access={access}
      memory={memory}
      onSessionExpired={onSessionExpired}
      onSignOut={onSignOut}
    >
      {ui}
    </ApiProvider>
  );
  return { ...result, api, memory, onSessionExpired, onSignOut };
}
