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
                     │  memory screens ─► MemoryApi (port)  │  GET|POST /v1/*  + Bearer <ID token>
                     │                   ├─ HttpMemoryApi ──┼──────────────────────────────►  memory API
                     │                   └─ InMemoryMemoryApi  (only if MEMORY_URL is set; tests only)
                     │  Logger ──► LogSink (JSON lines)     │
                     └──────────────────────────────────────┘
```

## Ports and adapters

| Port | Production adapter | Other adapters | Chosen by |
| --- | --- | --- | --- |
| `AuditApi` (`src/lib/api/port.ts`) | `HttpAuditApi` | `InMemoryAuditApi`, compiled into browser-test builds only | build flag `VITE_API_ADAPTER` (`http` default, `memory` for browser tests) |
| `MemoryApi` (`src/lib/memory/port.ts`) | `HttpMemoryApi`, created only when `MEMORY_URL` is set | `InMemoryMemoryApi`, compiled into browser-test builds only (same flag as the audit one) | `MEMORY_URL`; `VITE_API_ADAPTER` in tests |
| `AuthClient` (`src/lib/auth/types.ts`) | `FirebaseAuthClient`, over an `IdentityProvider` seam (lazy-loaded Firebase SDK) | a fake in unit tests | whether the Firebase web config is complete |
| `LogSink` (`src/lib/log`) | `ConsoleJsonSink` | `NullSink` | `LOG_SINK` |

Screens only know `AuditApi`. `src/lib/api/factory.ts` picks the adapter. The in-memory adapter is
loaded through a dynamic import guarded by `__IN_MEMORY_API__`, a constant Vite replaces at build
time, so every other build drops it. `scripts/check-production-bundle.mjs` runs after every
production build (including the Docker build) and **fails the build** if the in-memory adapter,
its fixture data, the browser-test configuration, or test-style wording is in the output.

Both HTTP adapters sit on one transport (`src/lib/api/transport.ts`): bearer token, one shared token refresh after a 401,
HTTP status to `ApiError` kind, schema validation of every response, and logging that records paths, query and body
field names, status and trace id but never a token, a query value or a request body (a memory question is sent as a POST
body and never appears in an address or a log line).

`HttpAuditApi` validates every response with zod schemas (`src/lib/api/schemas.ts`), whose event
shape is tied at compile time to `StoredAuditEvent` from `@smallseedlabs/proba-protocol` v0.3.3
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

`MEMORY_URL` (runtime) / `VITE_MEMORY_URL` (build) holds the address of the **memory API** (proba-memory, `apps/memory-api`). When it
is a valid http(s) address, the app creates a `MemoryApi` client and the sidebar gets a **Memory** group with four screens. When it is
absent there is no client, no entry, no route (a memory address shows the Audit Explorer) and no request.

| Screen | Route | Reads | Who |
| --- | --- | --- | --- |
| Memory Explorer | `#/memory?q=&category=&status=&source=` | `GET /v1/memories` (newest first, cursor paging) or, with a question, `POST /v1/memories/search` | everyone; `status` other than active is an administrator's filter |
| Memory Detail | `#/memory/<id>` | `GET /v1/memories/{id}` (memory and links); the replacement history follows `supersedesId` back and `supersedes` links forward (bounded, cycle-safe, stops where a memory is not readable); `GET /v1/memories/{id}/retrievals` | everyone; the retrieval history and the extraction model only for administrators |
| Retrieval Inspector | `#/retrievals/<id>` | `GET /v1/retrievals/{id}`, or `POST /v1/memories/search` with `includeCandidates` | administrators |
| Scoring profiles | `#/profiles` | `GET /v1/profiles` (the service adds each profile's configuration for administrators) | everyone; read-only |
| Jobs | `#/jobs` | `GET /v1/jobs/runs` | administrators |

Who may see what is decided by the memory API from the token (`403 insufficient_role`, viewers get active memories only); the portal
additionally does not ask for what a viewer cannot have, so a viewer never causes a refused request. The role shown in the portal
comes from the audit API's session; if the two services ever disagreed, the memory API's `403` is shown as "Not permitted".
Viewers who type `#/retrievals`, `#/profiles` or `#/jobs` see that same "Not permitted" screen without calling the memory API.

**Contract gap.** The memory API's OpenAPI document (main, with the M2 jobs) has no route for the Retrieval Inspector's logged
retrieval, a memory's retrieval history or the recent `job_runs`. The portal defines them in `src/lib/memory/schemas.ts` and
`http.ts` as read-only, administrator-only routes (the shapes mirror `RetrievalLogEntry`, a per-memory slice of it, and `JobRun` in
proba-memory), and treats a `404` on the two list routes as "this memory service does not provide that yet". They need to be added to
proba-memory; until then the Retrieval Inspector works through a search run with `includeCandidates`.

**Untrusted text.** Every memory carries `trust: "untrusted_data"` (the schema rejects anything else). Text is rendered as text,
never as markup, and each screen says it is information, not an instruction.

## Raw text (the Content panel)

Since protocol v0.3.3 an audit event can carry the raw text of what was said (`content`: the person's
message, the reply, an explanation). The audit API stores it apart from the event, serves it to
**administrators only**, and only when the deployment sets `AUDIT_CONTENT_ENABLED=true`. The portal
follows those rules; the server enforces them regardless of the UI.

How the API exposes it (proba-audit `docs/openapi.yaml`):

* Event routes never carry the text. An event says `hasContent: true`, and administrators also get its
  `contentDigest` (SHA-256 of the text, which the hash chain covers). Both are kept by the portal's
  event schema.
* `GET /v1/events/{eventId}/content` and `GET /v1/traces/{traceId}/content` return the text
  (`{ content: { kind, text, truncated, originalLength, redactions }, contentDigest, verified }`).
  Viewers get `403`; an event without text, or a deployment that does not serve text, gets `404`
  (`content_disabled`). Every such read is itself recorded by the API (`audit.event_viewed` /
  `audit.trace_viewed` with `contentIncluded: true`).

What the portal does:

* `TraceView` has a `content` entry in `TRACE_SECTIONS` (`TraceContentSection`) and `EventDrawer` shows
  `EventContentSection` for an event that has text. Both use `ContentBlock` (`src/components/audit/ContentPanel.tsx`):
  the kind in words, the text as plain text (never markup) in a keyboard-focusable region, **Copy text**,
  the length (`n of originalLength characters` plus a notice when it was cut), how many secrets were masked,
  and whether the text still matches the digest the chain covers (a mismatch is shown as an alert).
* It is **hidden entirely** (no heading, no placeholder) for viewers, for an event without text, and when
  the API answers `403` or `404`. For viewers the portal does not call the content routes at all
  (`useCanReadContent` is false), so no audited read is created. Other failures show a retry.
* The text is only ever fetched by id in the path, held in component state and rendered. It is never put
  in an address, in browser storage, in a log entry (the logger records method, path, status and timing,
  and redacts any field named `content`) or in an error message. Responses that do not match the schema
  are rejected rather than shown.
* The text is fetched when an administrator opens the trace or the event, so each such view is an audited
  read by design.

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
| Unit and component | Vitest + Testing Library (`TZ=UTC`) | time and range logic, filters, router, series, config, all adapters (each HTTP client is run against its in-memory source over a fake `fetch`, which doubles as a contract test), auth mapping, every screen with real interaction |
| Browser, project `app` | Playwright + axe | production UI against the in-memory adapter and the real Firebase SDK (identity endpoints answered at the network level): sign-in paths, every screen, filters, paging, drawer focus handling, empty/error states, accessibility (WCAG 2.2 AA tags), phone-sized layout |
| Browser, project `http` | Playwright | the production code path: bearer token on the wire, 401 refresh and retry, 403 access screen, sign-out on a revoked session, cursor paging, outage and retry, JSON log lines; for memory, the bearer token, search as a POST body, administrator routes never asked of a viewer, a service without job runs, outage and retry |

Both browser projects mock at the network layer (`e2e/support`), so nothing in the app is replaced.
Neither needs the audit API or a Firebase project. What they cannot show is a real Firebase project
and a real audit API together; run the portal through `proba/local` (`./up.sh --portal`) for that.

## Deployment

A multi-stage Docker build (Node 20 builder, `check:bundle` as part of the build; nginx 1.25 runtime,
non-root, port 8080, `/health`). Runtime configuration is written to `env-config.js` at container
start from environment variables (`docker/env.sh`), which the app reads before its build-time
`VITE_*` defaults. `env-config.js` is served with `no-store`.
