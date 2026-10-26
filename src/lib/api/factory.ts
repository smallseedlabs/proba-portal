import { HttpAuditApi, type TokenSource } from './http';
import type { AuditApi } from './port';

export interface AuditApiFactoryOptions {
  apiBaseUrl: string;
  getToken: TokenSource;
}

/**
 * Chooses the data source. Production builds always read from the audit API over HTTP. The
 * in-memory source exists only for the automated browser checks: `__IN_MEMORY_API__` is replaced
 * with a constant at build time, so the dynamic import below (and everything behind it) is removed
 * from every other build. scripts/check-production-bundle.mjs fails the build if it is not.
 */
export async function createAuditApi(options: AuditApiFactoryOptions): Promise<AuditApi> {
  if (__IN_MEMORY_API__) {
    const { InMemoryAuditApi } = await import('./memory/memory-audit-api');
    const api = new InMemoryAuditApi({
      role: window.sessionStorage.getItem('proba.e2e.role') === 'viewer' ? 'viewer' : 'admin',
      latencyMs: Number(window.sessionStorage.getItem('proba.e2e.latency')) || 0,
    });
    // Lets the browser checks inject failures and read call counts.
    (window as unknown as { __probaAudit?: unknown }).__probaAudit = api;
    return api;
  }
  return new HttpAuditApi({ baseUrl: options.apiBaseUrl, getToken: options.getToken });
}
