import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureApi, renderWithApi, NOW } from '../../test/render';
import { TraceView } from './TraceView';

beforeEach(() => {
  window.location.hash = '#/traces';
  Object.assign(navigator, { clipboard: { writeText: async () => undefined } });
});

async function failedTrace() {
  const api = fixtureApi();
  const failed = (await api.searchEvents({ action: 'tool.failed', limit: 1, from: new Date(NOW - 7 * 86_400_000).toISOString() })).events[0]!;
  return { api, traceId: failed.traceId, goalId: failed.goalId };
}

describe('TraceView', () => {
  it('shows the summary, the span tree with durations and the rolled-up outcome', async () => {
    const { api, traceId } = await failedTrace();
    renderWithApi(<TraceView traceId={traceId} />, { api });
    expect(screen.getByRole('status', { name: 'Loading trace' })).toBeInTheDocument();
    const tree = await screen.findByRole('tree', { name: 'Steps of this trace' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items[0]).toHaveAttribute('aria-level', '1');
    expect(within(items[0]!).getByText('command.received')).toBeInTheDocument();
    expect(within(tree).getByText('tool.failed')).toBeInTheDocument();
    expect(screen.getByTestId('trace-id')).toHaveTextContent(traceId);
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(within(items[0]!).getByText(/Contains failed steps/)).toBeInTheDocument();
    expect(within(items[0]!).getByText('18 ms')).toBeInTheDocument();
  });

  it('links to the goal, thread and campaign of the trace', async () => {
    const { api, traceId, goalId } = await failedTrace();
    renderWithApi(<TraceView traceId={traceId} />, { api });
    await screen.findByRole('tree');
    expect(screen.getByRole('link', { name: goalId! })).toHaveAttribute('href', expect.stringContaining(`#/explorer?goalId=${goalId}`));
    expect(screen.getByRole('link', { name: /cmp_/ })).toHaveAttribute('href', expect.stringMatching(/^#\/analytics\?campaignId=cmp_/));
  });

  it('collapses and expands branches', async () => {
    const { api, traceId } = await failedTrace();
    renderWithApi(<TraceView traceId={traceId} />, { api });
    const tree = await screen.findByRole('tree');
    const before = within(tree).getAllByRole('treeitem').length;
    await userEvent.click(screen.getByRole('button', { name: 'Collapse command.received' }));
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(before);
  });

  it('copies the trace ID and confirms it', async () => {
    const { api, traceId } = await failedTrace();
    renderWithApi(<TraceView traceId={traceId} />, { api });
    await screen.findByRole('tree');
    await userEvent.click(screen.getByRole('button', { name: 'Copy trace ID' }));
    await waitFor(() => expect(screen.getByText('Copied trace ID')).toBeInTheDocument());
  });

  it('opens a step as an event with its raw record', async () => {
    const { api, traceId } = await failedTrace();
    renderWithApi(<TraceView traceId={traceId} />, { api });
    await screen.findByRole('tree');
    await userEvent.click(screen.getByRole('button', { name: 'tool.failed' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: 'Raw event' })).toBeInTheDocument();
    expect(within(dialog).getByText('platform_rate_limited', { selector: 'p' })).toBeInTheDocument();
  });

  it('says plainly when the trace does not exist', async () => {
    renderWithApi(<TraceView traceId="00000000-0000-4000-8000-000000000000" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t find this trace');
  });
});
