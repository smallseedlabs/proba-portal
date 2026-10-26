import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from '../lib/api/errors';
import { useApiContext } from './api';

export type QueryState<T> =
  | { status: 'idle'; data?: undefined; error?: undefined }
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: ApiError };

export interface QueryResult<T> {
  state: QueryState<T>;
  /** Run again (the previous data stays visible while it loads). */
  reload: () => void;
}

/**
 * Runs `load` whenever `key` changes (`key` should be a stable string or null to stay idle), cancelling
 * the previous request. A rejected session is reported once to the app, which returns to sign-in.
 */
export function useApiQuery<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): QueryResult<T> {
  const { onSessionExpired } = useApiContext();
  const [state, setState] = useState<QueryState<T>>({ status: key === null ? 'idle' : 'loading' });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const expiredRef = useRef(onSessionExpired);
  expiredRef.current = onSessionExpired;

  useEffect(() => {
    if (key === null) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    // Keep showing the last result of the same query while it reloads, but not data of another one.
    setState((prev) => ({ status: 'loading', data: nonce > 0 ? prev.data : undefined }));
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = isApiError(error) ? error : new ApiError('unavailable', 'Something went wrong. Please try again.');
        if (apiError.kind === 'cancelled') return;
        if (apiError.kind === 'unauthenticated') expiredRef.current();
        setState({ status: 'error', error: apiError });
      });
    return () => controller.abort();
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
