# 05 — Prepare Looper for operator deployment

**What to build:** Make the completed Looper capsule safe and straightforward for an operator to configure, deploy, feed, and verify. A new operator should be able to understand the required secrets, claim and deploy the Lakebed app, submit a snapshot, and prove access control and live updates without reading implementation internals.

**Blocked by:** 04 — Finish resilient, responsive ticket viewing.

**Status:** done

- [x] A safe environment template documents the allowlist and ingestion secret without containing real credentials.
- [x] Operator documentation explains local development, quality checks, Lakebed validation builds, claimed deployment, environment synchronization, and optional subdomain reservation.
- [x] Documentation includes copyable examples for a valid complete snapshot and bearer-authenticated ingestion.
- [x] Documented response and recovery guidance covers authentication failure, malformed input, validation failure, size limits, and unexpected storage errors.
- [x] A clean checkout can install tooling and pass formatting, linting, hook, and Lakebed build checks using the documented commands.
- [x] An operator smoke checklist verifies signed-out, denied, allowed, empty, populated, project-switching, and live-update behavior.
- [x] Secret rotation and email revocation procedures are documented.
- [x] Logging is verified to expose useful ingestion outcomes and counts without credentials or complete ticket data.
- [x] The documentation identifies the accepted risks around email-based authorization, pinned CDN styling, complete snapshot replacement, and Lakebed's alpha hosting status.
