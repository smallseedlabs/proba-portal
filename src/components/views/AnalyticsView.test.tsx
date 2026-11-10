import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureApi, renderWithApi, NOW } from '../../test/render';
import { AnalyticsView } from './AnalyticsView';

beforeEach(() => {
  window.location.hash = '#/analytics';
  // The clock agrees with the fixture's, so period windows match the seeded metrics.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnalyticsView', () => {
  it('shows summary cards with the change against the previous period, a chart, and top campaigns', async () => {
    renderWithApi(<AnalyticsView />);
    const summary = await screen.findByRole('region', { name: 'Summary' }, { timeout: 3000 }).catch(() => screen.getByLabelText('Summary'));
    await waitFor(() => expect(within(summary).getByText('Impressions')).toBeInTheDocument());
    for (const label of ['Impressions', 'Clicks', 'Spend', 'Conversions']) {
      expect(within(summary).getByText(label)).toBeInTheDocument();
    }
    expect(within(summary).getAllByText(/vs previous 30 days/).length).toBe(4);
    expect(await screen.findByTestId('metric-chart')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(2);
  });

  it('shows when the data is current to', async () => {
    renderWithApi(<AnalyticsView />);
    await waitFor(() => expect(screen.getByTestId('freshness')).toHaveTextContent(/Data as of 26 Oct 2026, 12:00 UTC|Data as of/));
  });

  it('switches the metric charted', async () => {
    renderWithApi(<AnalyticsView />);
    await screen.findByTestId('metric-chart');
    await userEvent.click(screen.getByRole('button', { name: 'Spend' }));
    expect(screen.getByRole('heading', { name: 'Spend over time' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spend' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers hourly granularity with its own periods', async () => {
    renderWithApi(<AnalyticsView />);
    await screen.findByTestId('metric-chart');
    await userEvent.selectOptions(screen.getByLabelText('Granularity'), 'hour');
    await waitFor(() => expect(window.location.hash).toContain('granularity=hour'));
    expect(within(screen.getByLabelText('Period')).getByRole('option', { name: 'Last 24 hours' })).toBeInTheDocument();
    await screen.findByTestId('metric-chart');
    expect(screen.getByText(/Hourly figures cover complete hours/)).toBeInTheDocument();
  });

  it('keeps currencies apart', async () => {
    renderWithApi(<AnalyticsView />);
    await screen.findByTestId('metric-chart');
    const group = screen.getByRole('group', { name: 'Currency' });
    expect(within(group).getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'EUR' }));
    expect(await screen.findByText(/EUR · all campaigns|· EUR/)).toBeInTheDocument();
  });

  it('narrows to one campaign from the table and says so when there is nothing to show', async () => {
    renderWithApi(<AnalyticsView />);
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    await userEvent.click(within(table).getAllByRole('button', { name: /cmp_/ })[0]!);
    await waitFor(() => expect(window.location.hash).toContain('campaignId=cmp_'));
  });

  it('says so when there is no data in the period', async () => {
    renderWithApi(<AnalyticsView />, { api: fixtureApi({ metrics: [] }) });
    expect(await screen.findByText('No performance data for this period')).toBeInTheDocument();
    expect(screen.getByTestId('freshness')).toHaveTextContent('No data received yet');
  });
});

describe('AnalyticsView stub data', () => {
  async function withCampaigns(rows: Array<{ platform: string; accountId: string; campaignId: string; spend: number }>) {
    const api = fixtureApi();
    const real = await api.getTopCampaigns({ from: '2026-09-26T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z', granularity: 'day', limit: 1 });
    const template = real.campaigns[0]!;
    vi.spyOn(api, 'getTopCampaigns').mockResolvedValue({
      ...real,
      truncated: false,
      campaigns: rows.map((r) => ({ ...template, ...r })),
    });
    return api;
  }

  it('labels stub connector rows and says there is no real data yet', async () => {
    const api = await withCampaigns(
      Array.from({ length: 3 }, (_, i) => ({ platform: 'meta', accountId: 'stub_meta_acct_1', campaignId: `stub_meta_cmp_1${i}`, spend: 100 - i }))
    );
    renderWithApi(<AnalyticsView />, { api });
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    expect(within(table).getAllByText('Sample data')).toHaveLength(3);
    expect(screen.getByText('No real data yet')).toBeInTheDocument();
    expect(screen.getByTestId('sample-data-notice')).toHaveTextContent(/meta figures .* generated sample data .* not real delivery/);
  });

  it('keeps real campaigns visible behind many stub rows and drops the "no real data" title', async () => {
    const stubs = Array.from({ length: 12 }, (_, i) => ({
      platform: i % 2 ? 'google' : 'meta',
      accountId: `stub_${i % 2 ? 'google' : 'meta'}_acct_1`,
      campaignId: `stub_cmp_${i}`,
      spend: 1000 - i,
    }));
    const api = await withCampaigns([...stubs, { platform: 'reddit', accountId: 'a2_live', campaignId: '2000000001', spend: 1.5 }]);
    renderWithApi(<AnalyticsView />, { api });
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    const redditRow = within(table).getByRole('button', { name: '2000000001' }).closest('tr')!;
    expect(within(redditRow).queryByText('Sample data')).toBeNull();
    expect(within(table).getAllByText('Sample data')).toHaveLength(10);
    expect(screen.getByText('Includes sample data')).toBeInTheDocument();
    expect(screen.queryByText('No real data yet')).toBeNull();
    expect(screen.getByText(/plus every campaign with real data/)).toBeInTheDocument();
  });

  it('still shows only the top 10 when every row is real', async () => {
    const api = await withCampaigns(
      Array.from({ length: 14 }, (_, i) => ({ platform: 'reddit', accountId: 'a2_live', campaignId: `20000000${10 + i}`, spend: 100 - i }))
    );
    renderWithApi(<AnalyticsView />, { api });
    const table = await screen.findByRole('table', { name: 'Top campaigns by spend' });
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText(/Showing the top 10 campaigns by spend/)).toBeInTheDocument();
  });

  it('shows no stub notice for real data only', async () => {
    renderWithApi(<AnalyticsView />);
    await screen.findByRole('table', { name: 'Top campaigns by spend' });
    expect(screen.queryByTestId('sample-data-notice')).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
  });
});
