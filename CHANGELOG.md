# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Proba Insights web application: sign-in (Firebase), Audit Explorer, Trace View, Integrity and
  Analytics screens, and an optional Memory entry behind the `MEMORY_URL` flag.
- Typed `AuditApi` port with an HTTP adapter for the audit API `/v1` (protocol v0.3.3, types only; includes the content routes, `hasContent` and `contentDigest`).
- Structured JSON logging with trace ids (`LOG_LEVEL`, `LOG_SINK`).
- Content panel: administrators see the raw text of the steps in Trace View and in the event record
  (kind, text, cut-off notice with the original length, masked-secret count, integrity against the
  audit trail, copy). Hidden entirely for viewers and when the API has no text. Never logged and never in an address.
- Docker image, compose file, and CI (lint, typecheck, unit, browser tests, image build).
