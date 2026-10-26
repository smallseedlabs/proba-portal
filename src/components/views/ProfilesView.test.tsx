import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { fixtureMemoryApi, renderWithApi } from '../../test/render';
import { ProfilesView } from './ProfilesView';

describe('ProfilesView', () => {
  it('shows the active version of each profile and every version with its status', async () => {
    renderWithApi(<ProfilesView />, { memory: fixtureMemoryApi() });
    expect(screen.getByRole('status', { name: 'Loading scoring profiles' })).toBeInTheDocument();
    expect(await screen.findByTestId('active-default')).toHaveTextContent('Version 2');
    expect(screen.queryByTestId('active-approvals')).not.toBeInTheDocument();
    expect(screen.getByText('No active version')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Scoring profile versions' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['canary', 'shadow', 'active', 'retired']);
    expect(within(table).getByText('10% of requests')).toBeInTheDocument();
    expect(within(table).getAllByText('Every workspace', { selector: 'td' })).toHaveLength(3);
    expect(within(table).getByText('This workspace', { selector: 'td' })).toBeInTheDocument();
  });

  it('shows an administrator the configuration of each version, read-only', async () => {
    renderWithApi(<ProfilesView />, { memory: fixtureMemoryApi() });
    await screen.findByRole('table');
    const summary = screen.getAllByText('Configuration', { selector: 'summary' })[0]!;
    expect(summary).toBeInTheDocument();
    expect(screen.getAllByText('Share of the score').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /save|edit|activate|promote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('gives viewers the list and the active version, without the configuration', async () => {
    renderWithApi(<ProfilesView />, { role: 'viewer', memory: fixtureMemoryApi({ role: 'viewer' }) });
    expect(await screen.findByTestId('active-default')).toHaveTextContent('Version 2');
    expect(screen.queryByText('Configuration', { selector: 'summary' })).not.toBeInTheDocument();
  });

  it('explains a failure and retries', async () => {
    const memory = fixtureMemoryApi();
    const { ApiError } = await import('../../lib/api/errors');
    memory.failNext = new ApiError('network', "We couldn't reach Proba. Check your connection and try again.");
    renderWithApi(<ProfilesView />, { memory });
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load the scoring profiles');
  });
});
