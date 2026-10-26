// Fails if the in-memory data source, its fixture data, test-only configuration or prototype wording
// reach the production bundle. Run after `npm run build` (the build in ./dist).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
if (!existsSync(DIST)) {
  console.error(`Production bundle check failed: ${DIST} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const FORBIDDEN = [
  // The in-memory data source and its fixtures.
  /proba-in-memory-adapter/,
  /InMemoryAuditApi/,
  /seedAuditData|seedEvents|seedMetrics/,
  /fixture-subject/,
  /cmp_spring_launch/,
  /Pause the retargeting campaign until Thursday/,
  /workspace limit of 5,000/,
  /northwind\.example/,
  // The in-memory memory source and its fixtures.
  /proba-in-memory-memory-adapter/,
  /InMemoryMemoryApi/,
  /__probaMemory|__probaAudit/,
  /seedMemories|seedProfiles|seedJobRuns/,
  /7a1c0000-0000-4000/,
  /Daily spend above 5,000 USD/,
  /The embedding provider did not answer in time/,
  // Configuration used only by the browser checks.
  /proba-e2e/,
  /e2e-api-key/,
  /memory\.example\.com/,
  /127\.0\.0\.1:3998/,
  /127\.0\.0\.1:3997/,
  // Wording that must never reach people.
  /\bmock\b/i,
  /fixture/i,
  /dev login/i,
  /\balpha\b/i,
  /\bbeta\b/i,
  /\bstub\b/i,
  /coming soon/i,
  /lorem ipsum/i,
  // A Firebase web API key must come from the environment at run time or build time, never from the source.
  // (A key in a production build is expected when the build is configured with one: only the e2e values are forbidden.)
];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(js|html|css|map)$/.test(entry.name)) files.push(path);
  }
};
walk(DIST);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN) {
    const match = text.match(pattern);
    if (match) problems.push(`${file}: found "${match[0]}"`);
  }
}

// The in-memory sources are split into their own chunks when enabled: no such chunk may exist.
for (const file of files) {
  if (/memory-audit-api|in-memory-memory-api|memory-seed|seed/i.test(file)) problems.push(`${file}: an in-memory data source chunk was emitted`);
}

if (problems.length > 0) {
  console.error('Production bundle check failed:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Production bundle check passed (${files.length} files scanned in ${DIST}).`);
