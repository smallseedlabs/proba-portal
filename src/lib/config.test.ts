import { describe, it, expect, vi, afterEach } from 'vitest';
import { firebaseConfig, loadConfig, parseHttpUrl } from './config';

const FULL = {
  FIREBASE_API_KEY: 'key',
  FIREBASE_AUTH_DOMAIN: 'proba.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'proba',
  FIREBASE_APP_ID: '1:2:web:3',
};

afterEach(() => vi.unstubAllEnvs());

describe('firebaseConfig', () => {
  it('reads the Firebase web config from runtime values', () => {
    expect(firebaseConfig(FULL)).toEqual({ apiKey: 'key', authDomain: 'proba.firebaseapp.com', projectId: 'proba', appId: '1:2:web:3' });
  });

  it('falls back to build-time VITE_FIREBASE_* values', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'build-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'b.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'b');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'b-app');
    expect(firebaseConfig({ FIREBASE_PROJECT_ID: '' })).toEqual({ apiKey: 'build-key', authDomain: 'b.firebaseapp.com', projectId: 'b', appId: 'b-app' });
  });

  it('is null unless every value is present', () => {
    expect(firebaseConfig({ ...FULL, FIREBASE_APP_ID: ' ' })).toBeNull();
    expect(firebaseConfig(undefined)).toBeNull();
  });
});

describe('parseHttpUrl', () => {
  it('accepts http(s) addresses only', () => {
    expect(parseHttpUrl('https://memory.acme.io/')).toBe('https://memory.acme.io/');
    expect(parseHttpUrl(' https://memory.acme.io ')).toBe('https://memory.acme.io/');
    expect(parseHttpUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpUrl('/memory')).toBeNull();
    expect(parseHttpUrl('')).toBeNull();
    expect(parseHttpUrl(undefined)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('uses the runtime values over the build-time ones and trims trailing slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://build.example');
    expect(loadConfig({ API_BASE_URL: 'https://audit.acme.io///' }).apiBaseUrl).toBe('https://audit.acme.io');
    expect(loadConfig({}).apiBaseUrl).toBe('http://build.example');
  });

  it('switches the memory feature on only when a valid address is configured', () => {
    expect(loadConfig({ MEMORY_URL: '' }).memoryUrl).toBeNull();
    expect(loadConfig({ MEMORY_URL: 'not a url' }).memoryUrl).toBeNull();
    expect(loadConfig({ MEMORY_URL: 'https://memory.acme.io' }).memoryUrl).toBe('https://memory.acme.io/');
  });

  it('accepts PORTAL_MEMORY_URL as an alias of MEMORY_URL (umbrella stack naming)', () => {
    expect(loadConfig({ PORTAL_MEMORY_URL: 'https://memory.acme.io' }).memoryUrl).toBe('https://memory.acme.io/');
    expect(loadConfig({ MEMORY_URL: 'https://a.example/', PORTAL_MEMORY_URL: 'https://b.example/' }).memoryUrl).toBe(
      'https://a.example/'
    );
  });
});
