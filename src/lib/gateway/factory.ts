import type { TokenSource } from '../api/transport';
import { HttpGatewayApi } from './http';
import type { GatewayApi } from './port';

export interface GatewayApiFactoryOptions {
  /** Address of the gateway. Null when the guardrails screen is switched off. */
  gatewayUrl: string | null;
  getToken: TokenSource;
}

/**
 * Chooses the data source of the guardrails screen, like createMemoryApi does for memory.
 * Production builds always talk to the gateway over HTTP. The in-memory source exists only
 * for the automated browser checks (`__IN_MEMORY_API__` is a build-time constant).
 * Returns null when the feature is off.
 */
export async function createGatewayApi(options: GatewayApiFactoryOptions): Promise<GatewayApi | null> {
  if (!options.gatewayUrl) return null;
  if (__IN_MEMORY_API__) {
    const { InMemoryGatewayApi } = await import('./in-memory/in-memory-gateway-api');
    const api = new InMemoryGatewayApi({
      role: window.sessionStorage.getItem('proba.e2e.role') === 'viewer' ? 'viewer' : 'admin',
      latencyMs: Number(window.sessionStorage.getItem('proba.e2e.latency')) || 0,
    });
    (window as unknown as { __probaGateway?: unknown }).__probaGateway = api;
    return api;
  }
  return new HttpGatewayApi({ baseUrl: options.gatewayUrl, getToken: options.getToken });
}
