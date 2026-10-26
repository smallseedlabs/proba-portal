import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricChart } from './MetricChart';

const points = [
  { bucket: '2026-10-01', value: 100 },
  { bucket: '2026-10-02', value: 300 },
  { bucket: '2026-10-03', value: 200 },
];

function setup() {
  return render(<MetricChart points={points} granularity="day" label="Clicks" formatValue={(v) => `${v} clicks`} formatAxis={(v) => String(v)} />);
}

describe('MetricChart', () => {
  it('names itself and exposes the same numbers as a table', () => {
    setup();
    expect(screen.getByRole('img', { name: /Clicks: 3 days, peak 300 clicks/ })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Clicks by day' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('300 clicks')).toBeInTheDocument();
  });

  it('can be read point by point with the keyboard', async () => {
    setup();
    const group = screen.getByRole('group');
    await userEvent.tab();
    expect(group).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('1 Oct');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('200 clicks');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });

  it('copes with a period that has no points', () => {
    render(<MetricChart points={[]} granularity="hour" label="Spend" formatValue={String} formatAxis={String} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
