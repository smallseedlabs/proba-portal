import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../lib/api/errors';
import { fixtureApi, renderWithApi, NOW } from '../../test/render';
import { ExplorerView } from './ExplorerView';

beforeEach(() => {
  window.location.hash = '#/explorer';
  // The clock agrees with the fixture's, so "the last 24 hours" means the same window to both.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExplorerView', () => {
  it('lists the last 24 hours, newest first, and shows loading then results', async () => {
    renderWithApi(<ExplorerView />);
    expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Audit events' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(10);
    expect(screen.getByLabelText('Time range')).toHaveValue('24h');
  });

  it('filters by outcome from the filter bar and keeps the filter in the address', async () => {
    renderWithApi(<ExplorerView />);
    await screen.findByRole('table', { name: 'Audit events' });
    await userEvent.selectOptions(screen.getByLabelText('Outcome'), 'failure');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(window.location.hash).toContain('outcome=failure'));
    const table = await screen.findByRole('table', { name: 'Audit events' });
    const badges = within(table).getAllByText('Failed');
    expect(badges.length).toBeGreaterThan(0);
    expect(within(table).queryByText('Succeeded')).not.toBeInTheDocument();
    expect(screen.getByText('1 filter applied')).toBeInTheDocument();
  });

  it('pages forwards and back with cursors', async () => {
    renderWithApi(<ExplorerView />);
    const table = await screen.findByRole('table', { name: 'Audit events' });
    await userEvent.selectOptions(screen.getByLabelText('Rows per page'), '25');
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Audit events' })).getAllByRole('row')).toHaveLength(26));
    const firstPageFirst = within(screen.getByRole('table', { name: 'Audit events' })).getAllByRole('row')[1]!.textContent;
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(screen.getByText('Page 2')).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Audit events' })).getAllByRole('row')[1]!.textContent).not.toBe(firstPageFirst));
    await userEvent.click(screen.getByRole('button', { name: /Previous/ }));
    await waitFor(() => expect(screen.getByText('Page 1')).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Audit events' })).getAllByRole('row')[1]!.textContent).toBe(firstPageFirst));
    expect(table).toBeDefined();
  });

  it('opens an event with its raw JSON and a link to the trace, and returns focus on close', async () => {
    renderWithApi(<ExplorerView />);
    const table = await screen.findByRole('table', { name: 'Audit events' });
    const open = within(table).getAllByRole('button', { name: /Open details/ })[0]!;
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Raw event' })).toBeInTheDocument();
    const json = within(dialog).getByLabelText('Raw event JSON').textContent ?? '';
    expect(JSON.parse(json)).toMatchObject({ version: 1, workspaceId: 'ws_northwind' });
    expect(within(dialog).getByRole('link', { name: 'View trace' })).toHaveAttribute('href', expect.stringMatching(/^#\/traces\//));
    expect(window.location.hash).toContain('event=');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(open).toHaveFocus();
    expect(window.location.hash).not.toContain('event=');
  });

  it('shows an empty state, and clearing the filters brings events back', async () => {
    renderWithApi(<ExplorerView />);
    await screen.findByRole('table', { name: 'Audit events' });
    await userEvent.type(screen.getByLabelText('Text search'), 'zzzzzz');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument();
    await userEvent.click(within(screen.getByText('No events match these filters').parentElement!).getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('table', { name: 'Audit events' })).toBeInTheDocument();
  });

  it('validates filters before searching', async () => {
    const api = fixtureApi();
    renderWithApi(<ExplorerView />, { api });
    await screen.findByRole('table', { name: 'Audit events' });
    const before = api.calls.searchEvents;
    await userEvent.click(screen.getByRole('button', { name: /More filters/ }));
    await userEvent.type(screen.getByLabelText('Trace ID'), 'not-an-id');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText(/Enter a full ID/)).toBeInTheDocument();
    expect(api.calls.searchEvents).toBe(before);
  });

  it('explains a failure in plain words, with a reference, and recovers on retry', async () => {
    const api = fixtureApi({ latencyMs: 0 });
    api.failNext = new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.', { status: 503, traceId: 'trace-123' });
    renderWithApi(<ExplorerView />, { api });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We couldn’t load events');
    expect(alert).toHaveTextContent('trace-123');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Audit events' })).toBeInTheDocument();
  });

  it('sends a rejected session back to sign-in', async () => {
    const api = fixtureApi();
    api.failNext = new ApiError('unauthenticated', 'Your session is no longer valid. Please sign in again.', { status: 401 });
    const { onSessionExpired } = renderWithApi(<ExplorerView />, { api });
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });
});
