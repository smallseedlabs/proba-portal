# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security
- `docker-compose.yml` publishes the portal on `127.0.0.1` only (it was on every interface). New CI job **Compose security**
  (`npm run check:compose`, `scripts/check-compose-security.mjs`) fails on a published port that is not on `127.0.0.1`, a default
  or literal password, or host networking. The portal has no secrets, so there are no passwords to configure.

### Changed
- `MEMORY_URL` is now the address of the memory API and switches on in-app memory screens; it no longer adds a link that opens a memory console in a new tab.
- The audit API client's HTTP handling moved into a shared transport (`src/lib/api/transport.ts`); behaviour is unchanged.

### Added
- Memory screens behind the existing `MEMORY_URL` flag, now the address of the memory API: Memory Explorer (search; filter by
  category, status, source), Memory Detail (provenance, links, replacement history, retrieval history), Retrieval Inspector
  (candidates and feature scores; administrators), Scoring profiles (read-only list, active version, configuration for
  administrators) and Jobs (recent job runs; administrators). Typed `MemoryApi` port with an HTTP adapter; the in-memory adapter
  is compiled into browser-test builds only, and `check:bundle` fails the build if it or its data reaches a production bundle.
- Browser tests (including accessibility checks) and unit tests for the memory screens; a network-level memory API stand-in
  for the `http` browser project; new screenshots.
- Top bar shows the workspace name (for example "Seedbed") instead of the raw workspace id; uses the API's `workspaceName` when present.
- Proba Insights web application: sign-in (Firebase), Audit Explorer, Trace View, Integrity and
  Analytics screens, and an optional Memory entry behind the `MEMORY_URL` flag.
- Typed `AuditApi` port with an HTTP adapter for the audit API `/v1` (protocol v0.3.3, types only; includes the content routes, `hasContent` and `contentDigest`).
- Structured JSON logging with trace ids (`LOG_LEVEL`, `LOG_SINK`).
- Content panel: administrators see the raw text of the steps in Trace View and in the event record
  (kind, text, cut-off notice with the original length, masked-secret count, integrity against the
  audit trail, copy). Hidden entirely for viewers and when the API has no text. Never logged and never in an address.
- Docker image, compose file, and CI (lint, typecheck, unit, browser tests, image build).
