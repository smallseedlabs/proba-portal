import { useCallback, useMemo, useState } from 'react';

interface Pages {
  key: string;
  cursors: Array<string | undefined>;
}

/**
 * Cursor paging that can go back: the cursor of every page already visited is kept, so "Previous"
 * simply returns to an earlier cursor. Starts again from the first page when `resetKey` changes
 * (new filters or page size), in the same render, so a stale cursor is never sent with new filters.
 */
export function usePagedList(resetKey: string) {
  const [pages, setPages] = useState<Pages>({ key: resetKey, cursors: [undefined] });
  const cursors = useMemo(() => (pages.key === resetKey ? pages.cursors : [undefined]), [pages, resetKey]);
  const index = cursors.length - 1;

  const next = useCallback(
    (cursor: string) => setPages({ key: resetKey, cursors: [...cursors, cursor] }),
    [resetKey, cursors]
  );
  const previous = useCallback(
    () => setPages({ key: resetKey, cursors: cursors.length > 1 ? cursors.slice(0, -1) : cursors }),
    [resetKey, cursors]
  );
  return { cursor: cursors[index], pageNumber: index + 1, hasPrevious: index > 0, next, previous };
}
