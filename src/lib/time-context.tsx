import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** Times are stored and exchanged in UTC; people read them in their own time zone or in UTC. */
export type TimeMode = 'local' | 'utc';

const STORAGE_KEY = 'proba.insights.timeMode';

function loadMode(): TimeMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'utc' ? 'utc' : 'local';
  } catch {
    return 'local';
  }
}

interface TimeContextValue {
  mode: TimeMode;
  setMode: (mode: TimeMode) => void;
}

const TimeContext = createContext<TimeContextValue>({ mode: 'local', setMode: () => undefined });

export function TimeProvider({ children, initialMode }: { children: ReactNode; initialMode?: TimeMode }) {
  const [mode, setModeState] = useState<TimeMode>(initialMode ?? loadMode);
  const setMode = useCallback((next: TimeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  }, []);
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTimeMode(): TimeContextValue {
  return useContext(TimeContext);
}

