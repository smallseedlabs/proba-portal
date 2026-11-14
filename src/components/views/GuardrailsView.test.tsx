import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InMemoryGatewayApi } from '../../lib/gateway/in-memory/in-memory-gateway-api';
import { renderWithApi } from '../../test/render';
import { GuardrailsView } from './GuardrailsView';

describe('GuardrailsView', () => {
  it('shows the effective ceilings and saves a tightening', async () => {
    const gateway = new InMemoryGatewayApi();
    const user = userEvent.setup();
    renderWithApi(<GuardrailsView />, { gateway });

    expect(await screen.findByRole('heading', { name: 'Guardrails' })).toBeInTheDocument();
    expect(screen.getByText(/can only tighten/i)).toBeInTheDocument();
    const iterations = await screen.findByLabelText('Max iterations');
    await user.clear(iterations);
    await user.type(iterations, '3');
    await user.selectOptions(screen.getByLabelText('Policy for research.gather'), 'ask');
    await user.click(screen.getByRole('button', { name: 'Save guardrails' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Guardrails saved/));
    expect(gateway.writes).toBe(1);
    const saved = await gateway.getGuardrails();
    expect(saved.fileLimits.maxIterations).toBe(3);
    expect(saved.verbs.find((v) => v.name === 'research.gather')?.file).toBe('ask');
  });

  it('shows the gateway refusal when a write would loosen a code lock', async () => {
    const gateway = new InMemoryGatewayApi();
    // Bypass the disabled control to hit the API refusal path the gateway enforces.
    const user = userEvent.setup();
    renderWithApi(<GuardrailsView />, { gateway });
    await screen.findByRole('heading', { name: 'Guardrails' });
    await expect(gateway.putGuardrails({ verbs: { 'ads.create_campaign': 'allow' }, limits: {} })).rejects.toBeTruthy();
    // The create-campaign control cannot choose allow.
    const select = screen.getByLabelText('Policy for ads.create_campaign') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'ask', 'deny']);
    expect(screen.getByLabelText('Policy for ads.move_budget')).toBeDisabled();
    await user.selectOptions(select, 'deny');
    await user.click(screen.getByRole('button', { name: 'Save guardrails' }));
    await waitFor(() => expect(gateway.writes).toBe(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('edits the reviewer bounds and post copy checks, and keeps them on later saves', async () => {
    const gateway = new InMemoryGatewayApi();
    const user = userEvent.setup();
    renderWithApi(<GuardrailsView />, { gateway });
    const minHours = await screen.findByLabelText('Minimum hours between reviews');
    await user.type(minHours, '12');
    await user.type(screen.getByLabelText('Largest automatic change (%)'), '10');
    await user.type(screen.getByLabelText('Headline length cap'), '120');
    await user.type(screen.getByLabelText('Extra banned phrases (one per line)'), 'act now{enter}limited time');
    await user.click(screen.getByRole('button', { name: 'Save guardrails' }));
    await waitFor(() => expect(gateway.writes).toBe(1));
    let saved = await gateway.getGuardrails();
    expect(saved.reviewer?.file).toEqual({ minCheckHours: 12, maxAutoChangePct: 10 });
    expect(saved.reviewer?.effective).toEqual({ minCheckHours: 12, maxCheckHours: 168, maxAutoChangePct: 10 });
    expect(saved.creative?.file).toEqual({ maxHeadlineChars: 120, bannedPhrases: ['act now', 'limited time'] });

    // A later unrelated save sends the blocks back instead of dropping them.
    await user.selectOptions(screen.getByLabelText('Policy for research.gather'), 'ask');
    await user.click(screen.getByRole('button', { name: 'Save guardrails' }));
    await waitFor(() => expect(gateway.writes).toBe(2));
    saved = await gateway.getGuardrails();
    expect(saved.reviewer?.file).toEqual({ minCheckHours: 12, maxAutoChangePct: 10 });
    expect(saved.creative?.file?.bannedPhrases).toEqual(['act now', 'limited time']);
  });

  it('refuses a looser reviewer bound', async () => {
    const gateway = new InMemoryGatewayApi();
    const user = userEvent.setup();
    renderWithApi(<GuardrailsView />, { gateway });
    await user.type(await screen.findByLabelText('Largest automatic change (%)'), '50');
    await user.click(screen.getByRole('button', { name: 'Save guardrails' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/would loosen/);
    expect(gateway.writes).toBe(0);
  });
});
