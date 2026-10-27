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
