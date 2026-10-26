import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { NativeSelect } from '../ui/field';

export function Pager({
  pageNumber,
  count,
  pageSize,
  pageSizes,
  onPageSize,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  busy,
  noun,
}: {
  pageNumber: number;
  /** Number of rows on this page. */
  count: number;
  pageSize: number;
  pageSizes?: readonly number[];
  onPageSize?: (size: number) => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  busy?: boolean;
  noun: string;
}) {
  const first = (pageNumber - 1) * pageSize + 1;
  return (
    <nav aria-label={`${noun} pages`} className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {count === 0 ? `No ${noun}` : `Showing ${first.toLocaleString('en-GB')}–${(first + count - 1).toLocaleString('en-GB')}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {pageSizes && onPageSize && (
          <label className="flex items-center gap-2 text-caption text-muted-foreground">
            Rows per page
            <NativeSelect className="h-8 w-20 py-0 text-caption" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrevious} disabled={!hasPrevious || busy}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Button>
          <span className="text-caption text-muted-foreground">Page {pageNumber}</span>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext || busy}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
