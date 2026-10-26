import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiSession } from '../../lib/api/schemas';
import { TimeProvider } from '../../lib/time-context';
import { TopBar } from './TopBar';

function renderTopBar(access: ApiSession) {
  return render(
    <TimeProvider>
      <TopBar user={{ id: 'u', email: 'a@example.com', name: 'Amelia Frost' }} access={access} onSignOut={vi.fn()} onOpenNav={vi.fn()} />
    </TimeProvider>
  );
}

describe('TopBar workspace', () => {
  it('shows the workspace display name, not the raw id', () => {
    renderTopBar({ subject: 's', email: 'a@example.com', role: 'admin', workspaceId: 'seedbed' });
    expect(screen.getByRole('group', { name: 'Workspace Seedbed' })).toBeInTheDocument();
    expect(screen.getByText('Seedbed')).toBeInTheDocument();
    expect(screen.queryByText('seedbed')).not.toBeInTheDocument();
  });

  it('prefers the name provided by the API', () => {
    renderTopBar({ subject: 's', email: 'a@example.com', role: 'viewer', workspaceId: 'seedbed', workspaceName: 'Seedbed Labs' });
    expect(screen.getByText('Seedbed Labs')).toBeInTheDocument();
  });
});
