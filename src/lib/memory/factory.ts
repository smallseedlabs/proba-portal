import type { TokenSource } from '../api/transport';
import { HttpMemoryApi } from './http';
import type { MemoryApi } from './port';

export interface MemoryApiFactoryOptions {
  /** Address of the memory service. Null when the memory feature is switched off. */
  memoryUrl: string | null;
  getToken: TokenSource;
}

/**
 * Chooses the data source of the memory screens, like createAuditApi does for the audit screens. Production builds
 * always read from the memory API over HTTP. The in-memory source exists only for the automated browser checks
 * (`__IN_MEMORY_API__` is a build-time constant, so the dynamic import and everything behind it is removed from
 * every other build; scripts/check-production-bundle.mjs fails the build if it is not).
 * Returns null when the feature is off: there is then no memory client at all.
 */
export async function createMemoryApi(options: MemoryApiFactoryOptions): Promise<MemoryApi | null> {
  if (!options.memoryUrl) return null;
  if (__IN_MEMORY_API__) {
    const { InMemoryMemoryApi } = await import('./in-memory/in-memory-memory-api');
    const api = new InMemoryMemoryApi({
      role: window.sessionStorage.getItem('proba.e2e.role') === 'viewer' ? 'viewer' : 'admin',
      latencyMs: Number(window.sessionStorage.getItem('proba.e2e.latency')) || 0,
    });
    (window as unknown as { __probaMemory?: unknown }).__probaMemory = api;
    return api;
  }
  return new HttpMemoryApi({ baseUrl: options.memoryUrl, getToken: options.getToken });
}
