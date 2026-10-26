import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Granularity } from '../../lib/api/schemas';
import type { ChartPoint } from '../../lib/series';
import { formatBucketLabel } from '../../lib/time';
import { useTimeMode } from '../../lib/time-context';
import { niceTicks } from '../../lib/utils/chart';
import { useElementWidth } from '../../lib/utils/useElementWidth';

const HEIGHT = 280;
const MARGIN = { top: 16, right: 16, bottom: 32, left: 56 };

/**
 * A single-series area chart that stays readable at any width, can be explored with a pointer or the
 * arrow keys, and comes with the same numbers as a table for assistive technology.
 */
export function MetricChart({
  points,
  granularity,
  label,
  formatValue,
  formatAxis,
}: {
  points: ChartPoint[];
  granularity: Granularity;
  label: string;
  formatValue: (value: number) => string;
  formatAxis: (value: number) => string;
}) {
  const { mode } = useTimeMode();
  const [ref, width] = useElementWidth<HTMLDivElement>(720);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const liveId = useId();

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = Math.max(...points.map((p) => p.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => MARGIN.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => MARGIN.top + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 0 ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : '';

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
  const gradientId = `${titleId}-fill`;

  const indexFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - MARGIN.left;
    if (points.length <= 1) return 0;
    return Math.min(points.length - 1, Math.max(0, Math.round((px / innerW) * (points.length - 1))));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    if (e.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(points.length - 1);
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const activePoint = active !== null ? points[active] : undefined;
  const summary = `${label}: ${points.length} ${granularity === 'hour' ? 'hours' : 'days'}, peak ${formatValue(max)}`;

  return (
    <div>
      <div
        ref={ref}
        className="relative rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="group"
        aria-label={`${summary}. Use the left and right arrow keys to read each point.`}
        aria-describedby={liveId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          onPointerMove={(e) => setActive(indexFromPointer(e))}
          onPointerLeave={() => setActive(null)}
          className="block touch-pan-y"
          data-testid="metric-chart"
        >
          <title id={titleId}>{summary}</title>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--chart-grid))" strokeWidth="1" />
              <text x={MARGIN.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.bucket} x={x(i)} y={HEIGHT - 10} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {formatBucketLabel(p.bucket, granularity, mode)}
              </text>
            ) : null
          )}
          {area && <path d={area} fill={`url(#${gradientId})`} />}
          {line && <path d={line} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {activePoint && active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + innerH} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <circle cx={x(active)} cy={y(activePoint.value)} r="4.5" fill="hsl(var(--surface))" stroke="hsl(var(--chart-1))" strokeWidth="2" />
            </g>
          )}
        </svg>
        {activePoint && active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-surface-raised px-3 py-2 shadow-overlay"
            style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: 8 }}
            data-testid="chart-tooltip"
          >
            <p className="whitespace-nowrap text-caption text-muted-foreground">{formatBucketLabel(activePoint.bucket, granularity, mode)}</p>
            <p className="text-body font-semibold text-foreground">{formatValue(activePoint.value)}</p>
          </div>
        )}
      </div>
      <p id={liveId} className="sr-only" aria-live="polite">
        {activePoint ? `${formatBucketLabel(activePoint.bucket, granularity, mode)}: ${formatValue(activePoint.value)}` : ''}
      </p>
      <table className="sr-only">
        <caption>{label} by {granularity === 'hour' ? 'hour' : 'day'}</caption>
        <thead>
          <tr>
            <th scope="col">{granularity === 'hour' ? 'Hour' : 'Day'}</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.bucket}>
              <th scope="row">{formatBucketLabel(p.bucket, granularity, mode)}</th>
              <td>{formatValue(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
