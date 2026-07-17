# 06 — Add ticket details and incremental CRUD API

**What to build:** Make tickets readable beyond their title and make Looper manageable by trusted external scripts without replacing the complete snapshot. Ticket rows expand inline to show a description and status, tags disappear from the interface, and bearer-authenticated project/ticket CRUD endpoints append, update, and delete individual records while preserving canonical order. Keep the complete snapshot endpoint compatible for synchronization workloads.

**Blocked by:** 05 — Prepare Looper for operator deployment.

**Status:** done

- [x] Clicking or keyboard-activating a ticket row expands its description inline and activating it again collapses it.
- [x] Expanded details show description and status, with a clear fallback when no description exists.
- [x] Ticket tags no longer render anywhere in the viewer.
- [x] Snapshot ingestion accepts and stores an optional ticket description without breaking existing clients that still send tags.
- [x] Bearer-authenticated project CRUD endpoints can append, rename, and delete projects.
- [x] Bearer-authenticated ticket CRUD endpoints can append, update, and delete tickets within a project.
- [x] Incrementally created projects and tickets append after existing records and preserve deterministic display order.
- [x] Project deletion removes its tickets atomically; rejected operations leave existing data unchanged.
- [x] CRUD requests use the existing INGEST_TOKEN and return useful 201/200/4xx responses without leaking credentials.
- [x] Existing snapshot limits, uniqueness rules, authorization, live subscriptions, responsive behavior, and accessibility continue to work.
- [x] Operator documentation contains copyable CRUD examples.
- [x] Quality checks and the Lakebed build pass.
