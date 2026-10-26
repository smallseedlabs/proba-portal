import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { NAV_ENTRIES } from './nav';

describe('Sidebar', () => {
  it('has no Memory entry unless the memory console is configured', () => {
    render(<Sidebar current="explorer" items={NAV_ENTRIES} memoryUrl={null} />);
    expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Explorer' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the memory console in a new tab when it is configured', () => {
    render(<Sidebar current="analytics" items={NAV_ENTRIES} memoryUrl="https://memory.acme.io/" />);
    const link = screen.getByRole('link', { name: /Memory/ });
    expect(link).toHaveAttribute('href', 'https://memory.acme.io/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('carries no placeholder wording', () => {
    render(<Sidebar current="explorer" items={NAV_ENTRIES} memoryUrl={null} />);
    expect(document.body.textContent).not.toMatch(/coming soon|soon|placeholder|\btest\b|\bdemo\b/i);
  });
});
