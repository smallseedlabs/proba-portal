/**
 * The local metrics stub connector (proba-audit `stub-platform-connector`, enabled with
 * PLATFORM_CONNECTORS=meta:stub,google:stub) writes generated rows whose account and campaign
 * ids start with `stub_`. Real platform ids never do, so the portal can tell them apart
 * without a server change and label them instead of presenting them as delivery.
 */
const STUB_ID = /^stub_/;

export function isStubMetricsRow(row: { accountId?: string; campaignId?: string }): boolean {
  return STUB_ID.test(row.accountId ?? '') || STUB_ID.test(row.campaignId ?? '');
}
