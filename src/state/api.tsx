import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AuditApi } from '../lib/api/port';
import type { MemoryApi } from '../lib/memory/port';
import type { GatewayApi } from '../lib/gateway/port';
import type { ApiSession } from '../lib/api/schemas';
import type { SessionUser } from '../lib/auth';

export interface ApiContextValue {
  api: AuditApi;
  /** The person, from the identity provider. */
  user: SessionUser;
  /** What the audit API says about them: role and workspace. */
  access: ApiSession;
  /** The API rejected the session and it could not be renewed: return to sign-in. */
  onSessionExpired: () => void;
  onSignOut: () => void;
  /** The memory service client. Present only when the memory feature is switched on (MEMORY_URL is set). */
  memory: MemoryApi | null;
  /** The gateway admin client. Present only when GATEWAY_URL is set. */
  gateway: GatewayApi | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ children, ...value }: ApiContextValue & { children: ReactNode }) {
  const { api, user, access, onSessionExpired, onSignOut, memory, gateway } = value;
  const memo = useMemo(
    () => ({ api, user, access, onSessionExpired, onSignOut, memory, gateway }),
    [api, user, access, onSessionExpired, onSignOut, memory, gateway]
  );
  return <ApiContext.Provider value={memo}>{children}</ApiContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApiContext(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApiContext must be used within ApiProvider');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): AuditApi {
  return useApiContext().api;
}

/**
 * The memory service client. Only the memory screens call this, and they are only reachable when the feature is
 * switched on, so a missing client is a programming error rather than something to show.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useMemoryApi(): MemoryApi {
  const { memory } = useApiContext();
  if (!memory) throw new Error('useMemoryApi needs the memory feature to be switched on');
  return memory;
}

/**
 * The gateway admin client. Only the Guardrails screen calls this, and that screen is only
 * reachable when GATEWAY_URL is set, so a missing client is a programming error.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useGatewayApi(): GatewayApi {
  const { gateway } = useApiContext();
  if (!gateway) throw new Error('useGatewayApi needs the guardrails feature to be switched on');
  return gateway;
}
