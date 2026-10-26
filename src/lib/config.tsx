import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { FirebaseWebConfig } from './auth/firebase';

export interface AppConfig {
  /** Base URL of the audit API (proba-audit, apps/audit-api). */
  apiBaseUrl: string;
  /** Firebase Authentication web config; null when incomplete (sign-in unavailable). */
  firebase: FirebaseWebConfig | null;
  /**
   * Address of the Proba memory console. Feature flag: the "Memory" navigation entry exists only
   * when this is a valid http(s) address, and there is nothing in its place otherwise.
   */
  memoryUrl: string | null;
}

export interface RuntimeEnv {
  API_BASE_URL?: string;
  MEMORY_URL?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_APP_ID?: string;
}

/**
 * Firebase web config from build-time VITE_FIREBASE_* variables. A container
 * may override them at runtime through window.ENV (docker/env.sh). Nothing here is committed:
 * values come from the environment of the build or of the running container.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function firebaseConfig(env: RuntimeEnv | undefined): FirebaseWebConfig | null {
  const pick = (runtime: string | undefined, buildTime: string | undefined) => (runtime || buildTime || '').trim();
  const config: FirebaseWebConfig = {
    apiKey: pick(env?.FIREBASE_API_KEY, import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: pick(env?.FIREBASE_AUTH_DOMAIN, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: pick(env?.FIREBASE_PROJECT_ID, import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: pick(env?.FIREBASE_APP_ID, import.meta.env.VITE_FIREBASE_APP_ID),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

/** A usable http(s) address, or null. Anything else (blank, relative, another scheme) switches the feature off. */
// eslint-disable-next-line react-refresh/only-export-components
export function parseHttpUrl(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function loadConfig(env: RuntimeEnv | undefined = (window as { ENV?: RuntimeEnv }).ENV): AppConfig {
  return {
    apiBaseUrl: (env?.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100').replace(/\/+$/, ''),
    firebase: firebaseConfig(env),
    memoryUrl: parseHttpUrl(env?.MEMORY_URL || import.meta.env.VITE_MEMORY_URL),
  };
}

const ConfigContext = createContext<AppConfig | null>(null);

export function ConfigProvider({ children, config }: { children: ReactNode; config?: AppConfig }) {
  const value = useMemo(() => config ?? loadConfig(), [config]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return config;
}
