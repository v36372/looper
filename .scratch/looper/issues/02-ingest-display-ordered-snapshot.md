# 02 — Ingest and display a complete ordered snapshot

**What to build:** Let an external workload replace Looper's complete current snapshot through one authenticated request, then let an authorized viewer see the first project's tickets. The path must be safe end to end: validate the complete contract, commit all or nothing, preserve canonical array order, and never destroy the previous board after an unauthorized or invalid request. The resulting list shows only ticket key, title, tags, and status.

**Blocked by:** 01 — Bootstrap the private Looper shell.

**Status:** done

- [x] A request with the configured bearer secret can replace the complete current snapshot and receives project and ticket counts.
- [x] A missing or invalid bearer secret is rejected without changing stored data.
- [x] The endpoint accepts only version 1 snapshots that satisfy the agreed project, ticket, status, tag, uniqueness, and string constraints.
- [x] Snapshots above 10 projects or 500 total tickets are rejected without changing stored data.
- [x] Malformed, duplicate, or otherwise invalid values reject the entire request; no partial replacement is visible.
- [x] An empty project array validly clears the current board.
- [x] Authorized viewers receive projects and tickets in exactly the incoming array order, without a public rank field.
- [x] The first project is displayed after initial ingestion.
- [x] Every row contains only key, title, tags, and one of the exact labels OPEN, IN PROGRESS, IN REVIEW, NEEDS HUMAN, or DONE.
- [x] Tags retain incoming order and use the quiet monochrome badge treatment.
- [x] Unauthorized viewers cannot obtain snapshot data from the query surface.
- [x] Ingestion logs include outcome and counts but never the bearer token or full snapshot.
