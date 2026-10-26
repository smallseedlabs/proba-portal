import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureApi, renderWithApi, NOW } from '../../test/render';
import { IntegrityView } from './IntegrityView';

beforeEach(() => {
  window.location.hash = '#/integrity';
  // The clock agrees with the fixture's, so "the last 24 hours" means the same window to both.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrityView', () => {
  it('starts with an invitation to run a check, not a result', () => {
    renderWithApi(<IntegrityView />);
    expect(screen.getByText('No check run yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify integrity' })).toBeEnabled();
  });

  it('reports an intact chain with the number of records checked', async () => {
    renderWithApi(<IntegrityView />);
    await userEvent.click(screen.getByRole('button', { name: 'Verify integrity' }));
    expect(await screen.findByTestId('integrity-verdict')).toHaveTextContent('Chain intact');
    expect(screen.getByText('Records checked').nextSibling).toHaveTextContent(/^\d/);
  });

  it('lists the altered record and links to it', async () => {
    const api = fixtureApi();
    renderWithApi(<IntegrityView />, { api });
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'previous24');
    await userEvent.click(screen.getByRole('button', { name: 'Verify integrity' }));
    expect(await screen.findByTestId('integrity-verdict')).toHaveTextContent('1 problem found');
    const table = screen.getByRole('table', { name: 'Records that failed verification' });
    expect(within(table).getByText('Record was changed after it was written')).toBeInTheDocument();
    expect(within(table).getByRole('link')).toHaveAttribute('href', expect.stringContaining(`event=${api.tamperedEventId}`));
  });

  it('refuses a custom period of more than 24 hours before asking the API', async () => {
    const api = fixtureApi();
    renderWithApi(<IntegrityView />, { api });
    await userEvent.selectOptions(screen.getByLabelText('Period'), 'custom');
    await userEvent.type(screen.getByLabelText(/From/), '2026-10-20T00:00');
    await userEvent.type(screen.getByLabelText(/To/), '2026-10-22T00:00');
    await userEvent.click(screen.getByRole('button', { name: 'Verify integrity' }));
    expect(screen.getByText(/at most 24 hours/)).toBeInTheDocument();
    expect(api.calls.verifyChain).toBeUndefined();
  });

  it('is for administrators only', () => {
    renderWithApi(<IntegrityView />, { role: 'viewer' });
    expect(screen.getByText('Integrity checks need an administrator')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify integrity' })).not.toBeInTheDocument();
  });
});
