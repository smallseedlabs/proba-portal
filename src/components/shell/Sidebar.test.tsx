import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { visibleEntries } from './nav';

const names = (links: HTMLElement[]) => links.map((l) => l.textContent);

describe('Sidebar', () => {
  it('has no memory entries unless the memory feature is switched on', () => {
    render(<Sidebar current="explorer" items={visibleEntries({ admin: true, memory: false })} />);
    expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Memory Explorer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jobs' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Explorer' })).toHaveAttribute('aria-current', 'page');
  });

  it('groups the memory screens under a Memory heading when the feature is on', () => {
    render(<Sidebar current="profiles" items={visibleEntries({ admin: true, memory: true })} />);
    const group = screen.getByRole('group', { name: 'Memory' });
    expect(names(within(group).getAllByRole('link'))).toEqual(['Memory Explorer', 'Retrieval Inspector', 'Scoring profiles', 'Jobs']);
    expect(within(group).getByRole('link', { name: 'Scoring profiles' })).toHaveAttribute('aria-current', 'page');
    // Every entry stays in the app: nothing opens another site.
    for (const link of within(group).getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^#\//);
      expect(link).not.toHaveAttribute('target');
    }
  });

  it('hides the administrator-only memory screens from viewers', () => {
    render(<Sidebar current="memory" items={visibleEntries({ admin: false, memory: true })} />);
    const group = screen.getByRole('group', { name: 'Memory' });
    expect(names(within(group).getAllByRole('link'))).toEqual(['Memory Explorer']);
  });

  it('keeps an accessible name for the memory group in the compact rail', () => {
    render(<Sidebar current="memory" compact items={visibleEntries({ admin: true, memory: true })} />);
    expect(screen.getByRole('group', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Memory Explorer' })).toHaveAttribute('title', 'Memory Explorer');
  });

  it('carries no placeholder wording', () => {
    render(<Sidebar current="explorer" items={visibleEntries({ admin: true, memory: true })} />);
    expect(document.body.textContent).not.toMatch(/coming soon|soon|placeholder|\btest\b|\bdemo\b/i);
  });
});
