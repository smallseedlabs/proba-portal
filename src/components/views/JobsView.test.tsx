import { describe, it, expect } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureMemoryApi, renderWithApi } from '../../test/render';
import { JobsView } from './JobsView';

describe('JobsView', () => {
  it('lists recent runs newest first with their result, duration and what changed', async () => {
    renderWithApi(<JobsView />, { memory: fixtureMemoryApi() });
    expect(screen.getByRole('status', { name: 'Loading job runs' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Recent background job runs/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(10);
    expect(within(table).getAllByText('Re-embedding', { selector: 'p' }).length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Succeeded').length).toBeGreaterThan(5);
    // A failed run shows the reason, in words, and a run in progress says so.
    expect(within(table).getByText(/did not answer in time/)).toBeInTheDocument();
    expect(within(table).getByText('In progress')).toBeInTheDocument();
    expect(within(table).getByText('Checked what would change. Nothing was written.')).toBeInTheDocument();
    expect(within(table).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringMatching(/^#\/traces\//));
  });

  it('filters by job and result', async () => {
    const memory = fixtureMemoryApi();
    renderWithApi(<JobsView />, { memory });
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Result'), 'failed');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
    await userEvent.selectOptions(screen.getByLabelText('Result'), '');
    await userEvent.selectOptions(screen.getByLabelText('Job'), 'decay');
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3));
  });

  it('explains when the service does not report job runs', async () => {
    renderWithApi(<JobsView />, { memory: fixtureMemoryApi({ unserved: ['jobs'] }) });
    expect(await screen.findByText('This memory service does not report job runs')).toBeInTheDocument();
  });

  it('is for administrators only, and does not even ask the service', () => {
    const memory = fixtureMemoryApi({ role: 'viewer' });
    renderWithApi(<JobsView />, { role: 'viewer', memory });
    expect(screen.getByText('Jobs need an administrator')).toBeInTheDocument();
    expect(memory.calls.listJobRuns).toBeUndefined();
  });

  it('shows an empty result plainly', async () => {
    renderWithApi(<JobsView />, { memory: fixtureMemoryApi({ jobRuns: [] }) });
    expect(await screen.findByText('No job runs match')).toBeInTheDocument();
  });
});
