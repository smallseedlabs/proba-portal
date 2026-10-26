import { useCallback, useEffect, useState } from 'react';

export type Section = 'explorer' | 'traces' | 'integrity' | 'analytics' | 'memory' | 'retrievals' | 'profiles' | 'jobs';

export const SECTIONS: Section[] = ['explorer', 'traces', 'integrity', 'analytics', 'memory', 'retrievals', 'profiles', 'jobs'];

export interface Route {
  section: Section;
  /** A trace id for `traces/<id>`, a memory id for `memory/<id>`, a retrieval id for `retrievals/<id>`. */
  id?: string;
  /** Filters and view state, kept in the address so a view can be shared and reloaded. */
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const [path = '', search = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section, id] = path.split('/');
  const query = new URLSearchParams(search);
  if (SECTIONS.includes(section as Section)) {
    let decoded: string | undefined;
    try {
      decoded = id ? decodeURIComponent(id) : undefined;
    } catch {
      decoded = undefined;
    }
    return { section: section as Section, id: decoded, query };
  }
  return { section: 'explorer', query: new URLSearchParams() };
}

export function routeHref(route: { section: Section; id?: string; query?: URLSearchParams | Record<string, string | undefined> }): string {
  const params =
    route.query instanceof URLSearchParams
      ? route.query
      : new URLSearchParams(Object.entries(route.query ?? {}).filter((e): e is [string, string] => Boolean(e[1])));
  const qs = params.toString();
  return `#/${route.section}${route.id ? `/${encodeURIComponent(route.id)}` : ''}${qs ? `?${qs}` : ''}`;
}

export interface NavigateOptions {
  /** Replace the current history entry (used for filter edits, so Back leaves the page). */
  replace?: boolean;
}

/** Minimal hash router; keeps deep links working behind any static host. */
export function useRoute(): [Route, (route: Parameters<typeof routeHref>[0], options?: NavigateOptions) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Parameters<typeof routeHref>[0], options: NavigateOptions = {}) => {
    const href = routeHref(next);
    if (window.location.hash === href) {
      setRoute(parseHash(href));
    } else if (options.replace) {
      window.history.replaceState(null, '', href);
      setRoute(parseHash(href));
    } else {
      window.location.hash = href;
    }
  }, []);

  return [route, navigate];
}
