import { describe, expect, it } from 'vitest';
import { isStubMetricsRow } from './stub-data';

describe('isStubMetricsRow', () => {
  it('recognises the stub connector ids and nothing else', () => {
    expect(isStubMetricsRow({ accountId: 'stub_meta_acct_1', campaignId: 'stub_meta_cmp_11' })).toBe(true);
    expect(isStubMetricsRow({ accountId: 'stub_google_acct_2' })).toBe(true);
    expect(isStubMetricsRow({ accountId: 'a2_live', campaignId: '1999999999' })).toBe(false);
    expect(isStubMetricsRow({ accountId: 'my_stub_account' })).toBe(false);
    expect(isStubMetricsRow({})).toBe(false);
  });
});
