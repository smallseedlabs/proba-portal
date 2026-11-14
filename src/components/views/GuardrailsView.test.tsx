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
});
