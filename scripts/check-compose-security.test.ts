// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Each case shells out to `docker compose config`, which can take a while on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const checkerPath = resolve(__dirname, 'check-compose-security.mjs');
const composePath = resolve(__dirname, '../docker-compose.yml');
const checker = (await import(checkerPath)) as {
  checkComposeText: (text: string) => { violations: string[]; required: string[] };
};
const hasDocker = spawnSync('docker', ['compose', 'version']).status === 0;

describe('check-compose-security (static checks)', () => {
  const check = (env: string) => checker.checkComposeText(`services:\n  s:\n    image: x\n    environment:\n${env}\n`).violations;

  it('refuses a password with a default value, even an empty one', () => {
    expect(check('      DB_PASSWORD: ${DB_PASSWORD:-proba}')).toEqual([expect.stringContaining('has a default')]);
    expect(check('      DB_PASSWORD: ${DB_PASSWORD:-}')).toEqual([expect.stringContaining('has a default')]);
  });

  it('refuses a literal password, also inside a URL', () => {
    expect(check('      POSTGRES_PASSWORD: proba')).toEqual([expect.stringContaining('not a required variable')]);
    expect(check('      REDIS_URL: redis://proba:secret@redis:6379')).toEqual([expect.stringContaining('literal password')]);
  });

  it('accepts a required variable', () => {
    expect(check('      DB_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD}')).toEqual([]);
  });

  it('the portal docker-compose.yml has no static violations other than the public Firebase web API key', () => {
    const { violations } = checker.checkComposeText(readFileSync(composePath, 'utf8'));
    expect(violations.filter((v) => !v.includes('FIREBASE_API_KEY'))).toEqual([]);
  });
});

describe.skipIf(!hasDocker)('check-compose-security (the script, on resolved compose files)', () => {
  const run = (compose: string, ...flags: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'compose-test-'));
    const file = join(dir, 'docker-compose.yml');
    writeFileSync(file, compose);
    return spawnSync('node', [checkerPath, ...flags, file], { encoding: 'utf8' });
  };
  const portal = `services:
  portal:
    image: nginx
    environment:
      API_BASE_URL: http://localhost:3400
      FIREBASE_API_KEY: \${FIREBASE_API_KEY:-}
    ports:
      - "127.0.0.1:3410:8080"
`;

  it('passes the repository docker-compose.yml with the CI options', () => {
    const r = spawnSync('node', [checkerPath, '--allow-no-secrets', '--public', 'FIREBASE_API_KEY', composePath], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails without --allow-no-secrets: a file with no required password is suspicious by default', () => {
    expect(run(portal.replace('${FIREBASE_API_KEY:-}', 'x')).status).toBe(1);
  });

  it('treats the Firebase web API key as a secret unless it is declared public', () => {
    const r = run(portal, '--allow-no-secrets');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FIREBASE_API_KEY/);
    expect(run(portal, '--allow-no-secrets', '--public', 'FIREBASE_API_KEY').status).toBe(0);
  });

  it.each([
    ['a port bound to all interfaces', portal.replace('127.0.0.1:3410:8080', '3410:8080'), /bound to 0\.0\.0\.0/],
    ['a port bound to a LAN address', portal.replace('127.0.0.1:', '0.0.0.0:'), /bound to 0\.0\.0\.0/],
    ['a long-syntax port without a host ip', portal.replace('- "127.0.0.1:3410:8080"', '- target: 8080\n        published: 3410'), /bound to/],
    ['a password with a default', portal.replace('API_BASE_URL', 'DB_PASSWORD').replace('http://localhost:3400', '${DB_PASSWORD:-proba}'), /has a default/],
    ['host networking', portal.replace('    image', '    network_mode: host\n    image'), /network_mode host/],
  ])('fails on %s', (_name, compose, message) => {
    const r = run(compose, '--allow-no-secrets', '--public', 'FIREBASE_API_KEY');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(message);
  });
});
