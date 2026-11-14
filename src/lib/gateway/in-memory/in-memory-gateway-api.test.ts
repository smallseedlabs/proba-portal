import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { InMemoryGatewayApi } from './in-memory-gateway-api';

describe('InMemoryGatewayApi', () => {
  it('returns the effective snapshot and applies a tightening write', async () => {
    const api = new InMemoryGatewayApi();
    const first = await api.getGuardrails();
    expect(first.schema).toBe('proba.gateway-guardrails/v1-effective');
    expect(first.writable).toBe(true);
    const after = await api.putGuardrails({ verbs: { 'research.gather': 'ask' }, limits: { maxIterations: 3 } });
    expect(after.fileLimits).toEqual({ maxIterations: 3 });
    expect(after.verbs.find((v) => v.name === 'research.gather')?.effective).toBe('ask');
    expect(api.writes).toBe(1);
  });

  it('rejects loosening beyond a code lock or a deployment limit', async () => {
    const api = new InMemoryGatewayApi();
    await expect(api.putGuardrails({ verbs: { 'ads.create_campaign': 'allow' }, limits: {} })).rejects.toMatchObject({
      code: 'guardrails_rejected',
    } as Partial<ApiError>);
    await expect(api.putGuardrails({ verbs: {}, limits: { maxIterations: 99 } })).rejects.toBeInstanceOf(ApiError);
    expect((await api.getGuardrails()).fileLimits).toEqual({});
  });

  it('refuses viewers', async () => {
    const api = new InMemoryGatewayApi({ role: 'viewer' });
    await expect(api.getGuardrails()).rejects.toMatchObject({ kind: 'forbidden' });
  });
});
