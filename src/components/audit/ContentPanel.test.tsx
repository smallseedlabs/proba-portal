import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../lib/api/errors';
import type { AuditContent, AuditEventRecord } from '../../lib/api/schemas';
import { fixtureApi, renderWithApi, NOW } from '../../test/render';
import { TraceView } from '../views/TraceView';
import { EventDrawer } from './EventDrawer';

const WEEK = 7 * 86_400_000;
const written: string[] = [];

beforeEach(() => {
  window.location.hash = '#/traces';
  written.length = 0;
  Object.assign(navigator, { clipboard: { writeText: async (t: string) => void written.push(t) } });
});

async function eventWith(api = fixtureApi(), kind = 'user_message', text?: string) {
  const events = (await api.searchEvents({ limit: 200, from: new Date(NOW - WEEK).toISOString() })).events;
  const content = (api as unknown as { contents: Map<string, AuditContent> }).contents;
  return events.find((e) => e.hasContent && content.get(e.eventId)?.kind === kind && (text === undefined || content.get(e.eventId)?.text.includes(text)))!;
}

describe('raw text in Trace View', () => {
  it('shows an administrator the text of each step with its kind, length, masked-secret count and integrity', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'user_message', 'REDACTED');
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    const panel = await screen.findByTestId('content-panel');
    expect(within(panel).getByRole('heading', { name: 'Raw text', level: 2 })).toBeInTheDocument();
    expect(within(panel).getByText(/Visible to administrators only/)).toBeInTheDocument();
    const block = within(panel).getAllByTestId('content-block')[0]!;
    expect(within(block).getByRole('heading', { name: /Message from a person/ })).toBeInTheDocument();
    expect(within(block).getByTestId('content-text')).toHaveTextContent('[REDACTED:api_key]');
    expect(within(block).getByTestId('content-redactions')).toHaveTextContent('1');
    expect(within(block).getByText('Matches the audit trail record')).toBeInTheDocument();
    expect(api.calls['getTraceContent']).toBe(1);
  });

  it('says when the text was cut and how long it was', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'user_message', 'quarterly plan');
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    const panel = await screen.findByTestId('content-panel');
    expect(within(panel).getByText('2,000 of 18,250 characters')).toBeInTheDocument();
    expect(within(panel).getByRole('note')).toHaveTextContent('first 2,000 of 18,250 characters are kept');
  });

  it('copies the text of a step and confirms it', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'brain_reply');
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    const panel = await screen.findByTestId('content-panel');
    const block = within(panel).getAllByTestId('content-block').find((b) => b.getAttribute('data-kind') === 'brain_reply')!;
    await userEvent.click(within(block).getByRole('button', { name: /Copy text/ }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('The campaign is paused');
    expect(within(block).getByRole('status')).toHaveTextContent(/Copied/);
  });

  it('opens the step from its text', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'brain_reply');
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    await userEvent.click(await screen.findByRole('button', { name: 'Open step brain.reply_generated' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders the text as plain text, never as markup', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api);
    const contents = (api as unknown as { contents: Map<string, AuditContent> }).contents;
    contents.set(ev.eventId, { kind: 'user_message', text: '<img src=x onerror=alert(1)> <b>bold</b>', truncated: false, originalLength: 40, redactions: 0 });
    const { container } = renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    await screen.findByTestId('content-panel');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getAllByTestId('content-text')[0]).toHaveTextContent('<img src=x onerror=alert(1)> <b>bold</b>');
  });

  it('warns when the text no longer matches the audit trail record', async () => {
    const base = fixtureApi();
    const ev = await eventWith(base);
    const api = fixtureApi({ unverifiedContentEventIds: new Set([ev.eventId]) });
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    const panel = await screen.findByTestId('content-panel');
    expect(within(panel).getByText('Does not match the audit trail record')).toBeInTheDocument();
    expect(within(panel).getByRole('alert')).toHaveTextContent('changed after it was recorded');
  });

  it('is hidden entirely for viewers, and never asks the API for the text', async () => {
    const api = fixtureApi({ role: 'viewer' });
    const ev = await eventWith(api);
    renderWithApi(<TraceView traceId={ev.traceId} />, { api, role: 'viewer' });
    await screen.findByRole('tree');
    expect(screen.queryByTestId('content-panel')).toBeNull();
    expect(screen.queryByText('Raw text')).toBeNull();
    expect(api.calls['getTraceContent']).toBeUndefined();
    expect(api.calls['getEventContent']).toBeUndefined();
  });

  it('is hidden entirely when the deployment does not serve text', async () => {
    const api = fixtureApi({ contentEnabled: false });
    const ev = await eventWith(fixtureApi());
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    await screen.findByRole('tree');
    await waitFor(() => expect(api.calls['getTraceContent']).toBe(1));
    expect(screen.queryByTestId('content-panel')).toBeNull();
    expect(screen.queryByText('Raw text')).toBeNull();
  });

  it('is hidden for a trace without any text', async () => {
    const api = fixtureApi();
    const events = (await api.searchEvents({ limit: 200, from: new Date(NOW - WEEK).toISOString(), action: 'system.job_run' })).events;
    renderWithApi(<TraceView traceId={events[0]!.traceId} />, { api });
    await screen.findByRole('tree');
    await waitFor(() => expect(api.calls['getTraceContent']).toBe(1));
    expect(screen.queryByTestId('content-panel')).toBeNull();
  });

  it('offers a retry when the text cannot be loaded, and shows it once it can', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api);
    const real = api.getTraceContent.bind(api);
    let fail = true;
    api.getTraceContent = async (id, options) => {
      if (fail) {
        fail = false;
        throw new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.', { status: 503 });
      }
      return real(id, options);
    };
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    const panel = await screen.findByTestId('content-panel');
    expect(within(panel).getByText('We couldn’t load the raw text')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Try again/ }));
    expect((await screen.findAllByTestId('content-block')).length).toBeGreaterThan(0);
  });

  it('keeps the text out of the address', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api);
    renderWithApi(<TraceView traceId={ev.traceId} />, { api });
    await userEvent.click(await screen.findByRole('button', { name: /Open step/ }));
    await screen.findByRole('dialog');
    const text = (await api.getEventContent(ev.eventId)).content.text;
    expect(window.location.href).not.toContain(encodeURIComponent(text.slice(0, 20)));
    expect(window.location.hash).not.toContain('Raise');
  });
});

describe('raw text in the event drawer', () => {
  const open = (api: ReturnType<typeof fixtureApi>, ev: AuditEventRecord, role: 'admin' | 'viewer' = 'admin') =>
    renderWithApi(<EventDrawer eventId={ev.eventId} preloaded={ev} onClose={vi.fn()} />, { api, role });

  it('shows an administrator the text of the event', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'explanation');
    open(api, ev);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('heading', { name: 'Raw text', level: 3 })).toBeInTheDocument();
    expect(within(dialog).getByTestId('content-text')).toHaveTextContent('above the workspace limit');
    expect(within(dialog).getByRole('heading', { name: 'Explanation', level: 4 })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Raw event' })).toBeInTheDocument();
  });

  it('shows nothing for a viewer, even though the event says it has text', async () => {
    const api = fixtureApi({ role: 'viewer' });
    const ev = await eventWith(api, 'explanation');
    expect(ev.hasContent).toBe(true);
    open(api, ev, 'viewer');
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('heading', { name: 'Raw event' });
    expect(within(dialog).queryByText('Raw text')).toBeNull();
    expect(api.calls['getEventContent']).toBeUndefined();
  });

  it('does not ask for text of an event that has none', async () => {
    const api = fixtureApi();
    const [plain] = (await api.searchEvents({ limit: 50 })).events.filter((e) => !e.hasContent);
    open(api, plain!);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Raw text')).toBeNull();
    expect(api.calls['getEventContent']).toBeUndefined();
  });

  it('hides the panel when the text is gone', async () => {
    const api = fixtureApi();
    const ev = await eventWith(api, 'explanation');
    (api as unknown as { contents: Map<string, AuditContent> }).contents.delete(ev.eventId);
    open(api, ev);
    await waitFor(() => expect(api.calls['getEventContent']).toBe(1));
    expect(screen.queryByText('Raw text')).toBeNull();
  });
});
