import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AuditApi } from '../lib/api/port';
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
  /** Address of the memory console, when that feature is switched on. */
  memoryUrl: string | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ children, ...value }: ApiContextValue & { children: ReactNode }) {
  const { api, user, access, onSessionExpired, onSignOut, memoryUrl } = value;
  const memo = useMemo(
    () => ({ api, user, access, onSessionExpired, onSignOut, memoryUrl }),
    [api, user, access, onSessionExpired, onSignOut, memoryUrl]
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
