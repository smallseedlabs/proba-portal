# Architecture

Proba Insights is a single-page application: React 18, Vite, Tailwind (HSL design tokens, like
`proba-web`), strict TypeScript. It is a read-only client of the audit API. Everything outside the
browser sits behind an interface with adapters chosen by configuration.

```
                     ┌────────────── browser ───────────────┐
 Firebase Auth  ◄──► │ AuthClient ──► session (ID token)    │
 (identity)          │                   │                  │
                     │  screens ──► AuditApi (port)         │  GET /v1/*  + Bearer <ID token>
                     │                   ├─ HttpAuditApi ───┼──────────────────────────────►  audit API
                     │                   └─ InMemoryAuditApi│  (browser-test builds only)
                     │  Logger ──► LogSink (JSON lines)     │
                     └──────────────────────────────────────┘
```

## Ports and adapters

| Port | Production adapter | Other adapters | Chosen by |
| --- | --- | --- | --- |
| `AuditApi` (`src/lib/api/port.ts`) | `HttpAuditApi` | `InMemoryAuditApi`, compiled into browser-test builds only | build flag `VITE_API_ADAPTER` (`http` default, `memory` for browser tests) |
| `AuthClient` (`src/lib/auth/types.ts`) | `FirebaseAuthClient`, over an `IdentityProvider` seam (lazy-loaded Firebase SDK) | a fake in unit tests | whether the Firebase web config is complete |
| `LogSink` (`src/lib/log`) | `ConsoleJsonSink` | `NullSink` | `LOG_SINK` |

Screens only know `AuditApi`. `src/lib/api/factory.ts` picks the adapter. The in-memory adapter is
loaded through a dynamic import guarded by `__IN_MEMORY_API__`, a constant Vite replaces at build
time, so every other build drops it. `scripts/check-production-bundle.mjs` runs after every
production build (including the Docker build) and **fails the build** if the in-memory adapter,
its fixture data, the browser-test configuration, or test-style wording is in the output.

`HttpAuditApi` validates every response with zod schemas (`src/lib/api/schemas.ts`), whose event
shape is tied at compile time to `StoredAuditEvent` from `@smallseedlabs/proba-protocol` v0.3.1
(imported as types only). All failures are `ApiError`s with a `kind` the screens present in plain
language, with the server's trace id as a "Reference" to quote to support.

## Authentication

The portal signs people in with **Firebase Authentication** (email and password, Google, password
reset), the same Firebase project as `proba-web` and `proba-hub`.

* The browser holds the Firebase session (tab-scoped, `browserSessionPersistence`: closing the tab
  ends it). The portal never sees a password after it has been handed to Firebase.
* Each request to the audit API carries the Firebase **ID token** as `Authorization: Bearer …`.
  The audit API verifies it itself against Google's public keys (`AUDIT_API_TOKEN_VERIFIER=firebase`,
  `FIREBASE_PROJECT_ID`). There is no Hub session and no token exchange: the audit API does not
  depend on the Hub being up.
* A 401 makes the portal refresh the ID token once and retry (simultaneous 401s share one refresh).
  If the refresh fails, the session is over and the person is returned to sign-in with an explanation.
* Authorisation is the audit API's: it allows only verified emails listed in
  `AUDIT_API_ALLOWED_EMAILS` / `AUDIT_API_ALLOWED_EMAIL_DOMAINS`, and treats `AUDIT_API_ADMIN_EMAILS`
  as administrators. After sign-in the portal calls `GET /v1/session`, which returns
  `{ role: viewer | admin, workspaceId }`. The UI follows it: administrators see **Integrity**;
  viewers do not (and the route explains why if opened by address). A 403 shows an access screen
  that names the account and offers to sign out. The server enforces all of this regardless of the UI.
* The audit API must list the portal's exact origin in `AUDIT_API_CORS_ORIGINS`.

## Data and time

* Timestamps are UTC on the wire and in storage. The header offers *Local* (default) and *UTC*.
* Lists use keyset cursors. `usePagedList` keeps a stack of cursors for Previous and resets when
  any filter changes.
* Analytics periods are whole buckets: hourly ends on the last complete hour (up to 14 days),
  daily ends at UTC midnight (up to 366 days), so "as of" is honest and the comparison period is the
  same length immediately before. Series are per (bucket, currency); currencies are never added
  together, and a currency switch appears when more than one exists. The data-freshness line shows
  when the figures are current to.
* Integrity checks cover at most 24 hours at a time; the screen says when a check was partial.

## Navigation

Hash routes (`#/explorer`, `#/traces/<id>`, …) so deep links work behind any static host. Filter
edits replace the history entry; opening a trace pushes one.

## Feature flag: Memory

`MEMORY_URL` (runtime) / `VITE_MEMORY_URL` (build) holds the address of the memory console. When it
is a valid http(s) address, the sidebar gets a **Memory** entry that opens it in a new tab. When it is
absent there is no entry, no route and no placeholder.

## Trace View and the future `content` panel

Audit events will later carry an optional, administrator-only `content` field (raw event text). It
is **not built yet**. The page is arranged so it can be added without reshaping anything:

* `TraceView` renders an ordered list of sections (`TRACE_SECTIONS` in `src/components/views/TraceView.tsx`):
  summary, notices, steps. A content panel is one more entry (and its component), shown only when
  the session role is `admin` and the trace's events carry `content`.
* The event schema (`storedAuditEventSchema`) currently drops unknown fields, so a server that adds
  `content` early changes nothing in the UI. When it ships: add `content` as an optional field to the
  schema (the compile-time check against the protocol type will say when the protocol has it),
  read it in the new section, and keep it admin-only. The server should also omit it for viewers.
* The logger redacts any field named `content`, so raw text cannot leak into logs by accident.

## Logging

Every log entry is one JSON object: `ts`, `level`, `service`, `event`, `traceId`, `sessionId`, plus
event fields. `traceId` is the audit API's trace id for entries about a request to it (from
`X-Trace-Id`), otherwise the id of the browser session, so a support reference can be matched with
the server's logs. Logged: application start, sign-in outcomes (no emails), each API request (method,
path, query *keys*, status, duration), token refreshes, API errors, session ready/rejected/expired,
rendering failures and uncaught errors. Never logged: tokens, emails, passwords, query values (a
text search may be sensitive), or raw content: names matching
`token|authorization|password|secret|api key|cookie|credential|email|content` are replaced by
`[redacted]`.

## Testing

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit and component | Vitest + Testing Library (`TZ=UTC`) | time and range logic, filters, router, series, config, both adapters (the HTTP client is run against the in-memory source over a fake `fetch`, which doubles as a contract test), auth mapping, every screen with real interaction |
| Browser, project `app` | Playwright + axe | production UI against the in-memory adapter and the real Firebase SDK (identity endpoints answered at the network level): sign-in paths, every screen, filters, paging, drawer focus handling, empty/error states, accessibility (WCAG 2.2 AA tags), phone-sized layout |
| Browser, project `http` | Playwright | the production code path: bearer token on the wire, 401 refresh and retry, 403 access screen, sign-out on a revoked session, cursor paging, outage and retry, JSON log lines |

Both browser projects mock at the network layer (`e2e/support`), so nothing in the app is replaced.
Neither needs the audit API or a Firebase project. What they cannot show is a real Firebase project
and a real audit API together; run the portal through `proba/local` (`./up.sh --portal`) for that.

## Deployment

A multi-stage Docker build (Node 20 builder, `check:bundle` as part of the build; nginx 1.25 runtime,
non-root, port 8080, `/health`). Runtime configuration is written to `env-config.js` at container
start from environment variables (`docker/env.sh`), which the app reads before its build-time
`VITE_*` defaults. `env-config.js` is served with `no-store`.
