import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureMemoryApi, renderWithApi } from '../../test/render';
import { RetrievalInspectorView } from './RetrievalInspectorView';

beforeEach(() => {
  window.location.hash = '#/retrievals';
  Object.assign(navigator, { clipboard: { writeText: async () => undefined } });
});

async function loggedId(memory = fixtureMemoryApi()) {
  const found = await memory.searchMemories({ query: 'when does a campaign budget need administrator approval', limit: 3 });
  return { memory, id: found.retrievalId };
}

describe('RetrievalInspectorView', () => {
  it('starts by inviting an administrator to open or run a retrieval', () => {
    renderWithApi(<RetrievalInspectorView />, { memory: fixtureMemoryApi() });
    expect(screen.getByText('No retrieval open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
  });

  it('shows a logged retrieval with every candidate and its feature scores', async () => {
    const { memory, id } = await loggedId();
    renderWithApi(<RetrievalInspectorView retrievalId={id} />, { memory });
    const panel = await screen.findByTestId('retrieval-panel');
    expect(within(panel).getByText(id)).toBeInTheDocument();
    expect(within(panel).getByTestId('retrieval-query')).toHaveTextContent('when does a campaign budget need administrator approval');
    expect(within(panel).getByText(/default v2/)).toBeInTheDocument();
    const table = within(panel).getByRole('table', { name: 'Candidates considered for this retrieval' });
    for (const header of ['Score', 'Relevance', 'Recency', 'Importance', 'Confidence', 'Usefulness']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(3);
    expect(within(rows[0]!).getByText(/^Returned #1$/)).toBeInTheDocument();
    expect(within(table).getAllByText(/Over the result limit|Scored below the minimum|Did not fit the token budget/).length).toBeGreaterThan(0);
    // The breakdown of one score opens in place.
    expect(within(rows[0]!).getByText(/how this score was built/)).toBeInTheDocument();
  });

  it('filters the candidates to those returned or left out', async () => {
    const { memory, id } = await loggedId();
    renderWithApi(<RetrievalInspectorView retrievalId={id} />, { memory });
    const table = await screen.findByTestId('candidates-table');
    const all = within(table).getAllByRole('row').length;
    await userEvent.click(screen.getByRole('button', { name: 'Returned' }));
    const returned = within(screen.getByTestId('candidates-table')).getAllByRole('row').length;
    expect(returned).toBeLessThan(all);
    expect(screen.getByRole('button', { name: 'Returned' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Left out' }));
    for (const row of within(screen.getByTestId('candidates-table')).getAllByRole('row').slice(1)) expect(row).toHaveAttribute('data-selected', 'false');
  });

  it('runs a search and shows how it was answered, with the text of the returned memories', async () => {
    const memory = fixtureMemoryApi();
    renderWithApi(<RetrievalInspectorView />, { memory });
    await userEvent.type(screen.getByLabelText('Question'), 'campaign budget approval{enter}');
    const panel = await screen.findByTestId('retrieval-panel');
    expect(within(panel).getByText(/5,000 USD per day/)).toBeInTheDocument();
    expect(memory.calls.searchMemories).toBe(1);
    expect(screen.getByText(/recorded as a retrieval, and in the audit trail/)).toBeInTheDocument();
  });

  it('opens a retrieval by its ID and moves to its address', async () => {
    const { memory, id } = await loggedId();
    renderWithApi(<RetrievalInspectorView />, { memory });
    await userEvent.type(screen.getByLabelText('Retrieval ID'), id);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/retrievals/${id}`));
  });

  it('rejects an ID that is not one, and a blank question, before asking the service', async () => {
    const memory = fixtureMemoryApi();
    renderWithApi(<RetrievalInspectorView />, { memory });
    await userEvent.type(screen.getByLabelText('Retrieval ID'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(/Enter a full retrieval ID/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Enter a question to search for.')).toBeInTheDocument();
    expect(memory.calls.searchMemories).toBeUndefined();
    expect(memory.calls.getRetrieval).toBeUndefined();
  });

  it('says plainly when a retrieval cannot be found', async () => {
    renderWithApi(<RetrievalInspectorView retrievalId="00000000-0000-4000-8000-000000000000" />, { memory: fixtureMemoryApi() });
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t find this retrieval');
  });

  it('is for administrators only, and does not even ask the service', () => {
    const memory = fixtureMemoryApi({ role: 'viewer' });
    renderWithApi(<RetrievalInspectorView retrievalId="3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73" />, { role: 'viewer', memory });
    expect(screen.getByTestId('not-permitted')).toBeInTheDocument();
    expect(screen.getByText('Not permitted')).toBeInTheDocument();
    expect(memory.calls.getRetrieval).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });
});
