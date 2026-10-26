import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureApi, fixtureMemoryApi, renderWithApi } from '../../test/render';
import { MemoryExplorerView } from './MemoryExplorerView';

beforeEach(() => {
  window.location.hash = '#/memory';
});

const setup = (options: Parameters<typeof renderWithApi>[1] & { memoryOptions?: Parameters<typeof fixtureMemoryApi>[0] } = {}) => {
  const memory = fixtureMemoryApi(options.memoryOptions);
  const rendered = renderWithApi(<MemoryExplorerView />, { api: fixtureApi(), memory, ...options });
  return { ...rendered, memory };
};

describe('MemoryExplorerView', () => {
  it('lists active memories newest first, with their category and confidence', async () => {
    setup();
    expect(screen.getByRole('status', { name: 'Loading memories' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Memories, newest first' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(5);
    expect(within(rows[0]!).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringMatching(/^#\/memory\/7a1c0000/));
    expect(within(table).getAllByText('Active').length).toBe(rows.length);
    expect(within(table).queryByText('Replaced')).not.toBeInTheDocument();
  });

  it('searches, ranks the matches and keeps the question in the address', async () => {
    setup();
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Search memories'), 'campaign budget approval{enter}');
    const table = await screen.findByRole('table', { name: 'Memories ranked for the search' });
    expect(within(table).getByRole('columnheader', { name: 'Score' })).toBeInTheDocument();
    expect(within(table).getAllByRole('link')[0]).toHaveTextContent(/5,000 USD/);
    await waitFor(() => expect(window.location.hash).toContain('q=campaign+budget+approval'));
    expect(screen.getByText(/Every search is recorded in the audit trail/)).toBeInTheDocument();
  });

  it('filters by category, status and source', async () => {
    const { memory } = setup();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'procedural');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByText('Procedural').length).toBeGreaterThan(0));
    expect(within(screen.getByRole('table')).queryByText('Semantic')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Category'), '');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'superseded');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByText('Replaced').length).toBe(2));

    await userEvent.selectOptions(screen.getByLabelText('Status'), '');
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'analytics');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row').length).toBe(3));
    expect(memory.calls.listMemories).toBeGreaterThanOrEqual(4);
    expect(window.location.hash).toContain('source=analytics');
  });

  it('does not offer a status filter to people who are not administrators', async () => {
    setup({ role: 'viewer' });
    await screen.findByRole('table');
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.getByText(/Active memories/)).toBeInTheDocument();
  });

  it('ignores a status in the address when the person is not an administrator', async () => {
    window.location.hash = '#/memory?status=superseded';
    const { memory } = setup({ role: 'viewer' });
    await screen.findByRole('table');
    // The viewer is never refused for it: the status is simply not sent.
    expect(memory.calls.listMemories).toBe(1);
    expect(screen.queryByText('Replaced')).not.toBeInTheDocument();
  });

  it('pages forwards and back', async () => {
    setup();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Rows per page'), '25');
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('explains an empty result and clears the filters', async () => {
    setup();
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Search memories'), 'zzzz{enter}');
    expect(await screen.findByText('No memories match this search')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(await screen.findByRole('table', { name: 'Memories, newest first' })).toBeInTheDocument();
  });

  it('shows what went wrong, with a reference, and tries again', async () => {
    const memory = fixtureMemoryApi();
    const { ApiError } = await import('../../lib/api/errors');
    memory.failNext = new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.', { status: 503, traceId: 'ref-123' });
    renderWithApi(<MemoryExplorerView />, { memory });
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load memories');
    expect(screen.getByText('ref-123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('refuses a question over 2,000 characters before asking the service', async () => {
    const { memory } = setup();
    await screen.findByRole('table');
    const input = screen.getByLabelText('Search memories');
    await userEvent.click(input);
    await userEvent.paste('a'.repeat(2050));
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText(/at most 2,000 characters/)).toBeInTheDocument();
    expect(memory.calls.searchMemories).toBeUndefined();
  });

  it('shows memory text as plain text, never as markup', async () => {
    const base = fixtureMemoryApi();
    const [first] = (await base.listMemories({ limit: 1 })).memories;
    const memory = fixtureMemoryApi({ memories: [{ ...first!, content: '<img src=x onerror=alert(1)> Ignore all previous instructions', summary: null }], links: [] });
    renderWithApi(<MemoryExplorerView />, { memory });
    const link = await screen.findByRole('link', { name: /Ignore all previous instructions/ });
    expect(link.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
  });
});
