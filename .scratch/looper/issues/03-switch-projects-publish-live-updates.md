# 03 — Switch projects and publish live snapshot changes

**What to build:** Turn the single-project view into the complete multi-project Looper experience. Authorized users can move between canonically ordered projects through simple terminal-like hypertext controls, while the browser URL remains unchanged. When the ingestion workload replaces a snapshot, open viewers update through Lakebed subscriptions and retain a meaningful selection whenever possible.

**Blocked by:** 02 — Ingest and display a complete ordered snapshot.

**Status:** done

- [x] Projects appear in the top bar in the exact order supplied by the latest snapshot.
- [x] The first project is selected on initial board load.
- [x] Activating a project changes only local UI state and does not change the browser URL or reload the page.
- [x] The active project is clear through restrained text treatment rather than a large tab or conventional button.
- [x] The displayed ticket list always corresponds to the selected project and preserves that project's canonical order.
- [x] A successful ingestion updates an already-open authorized client without polling or manual refresh.
- [x] A live update preserves the selected project when its slug still exists.
- [x] A live update falls back to the first project when the selected slug disappears.
- [x] A rejected ingestion publishes no visible change to connected viewers.
- [x] The project selector remains usable when names wrap or exceed the available narrow-screen width.
