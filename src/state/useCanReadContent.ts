import { useApiContext } from './api';

/**
 * Raw text of events is for administrators only. The audit API enforces that (403 for everyone else);
 * the portal does not even ask unless the signed-in person is an administrator, and shows nothing at all
 * (no heading, no placeholder) when the API has no text to give.
 */
export function useCanReadContent(): boolean {
  return useApiContext().access.role === 'admin';
}
