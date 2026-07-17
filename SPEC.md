# Looper — Product and Technical Specification

**Status:** Agreed for implementation  
**Scope:** Lakebed MVP  
**Last updated:** 2025-07-17

## 1. Product definition

Looper is a private, read-only ticket viewer for small teams. It presents one ordered list of tickets at a time, grouped by selectable projects, in a refined terminal-inspired interface.

The application is intentionally narrow: another workload prepares the data, while Looper displays the latest complete snapshot beautifully and updates connected viewers when that snapshot changes.

## 2. Goals

- Make the current ticket snapshot easy and pleasant to scan.
- Preserve the project and ticket order supplied by the ingestion workload.
- Support multiple projects through a simple top-bar selector.
- Push committed snapshot changes to connected viewers through Lakebed subscriptions.
- Restrict viewing to an environment-managed list of Google account emails.
- Keep ingestion atomic, authenticated, and simple for another workload to call.

## 3. Non-goals

The MVP will not include:

- Ticket creation, editing, deletion, or reordering in the UI.
- Search, filters, user-selectable sorting, or grouping.
- Ticket detail pages or shareable project routes.
- Source links, descriptions, assignees, avatars, priorities, dates, or activity.
- Project or access administration screens.
- Historical snapshots, audit history, or rollback.
- Cloudflare Workers, Durable Objects, or Effect v4.
- Offline support or a service worker.
- A light theme or user-selectable themes.

## 4. Users and access

### 4.1 Authentication

- Every viewer must sign in through Lakebed's built-in Google authentication.
- Guest users receive only a sign-in screen and no board data.
- The server requires `auth.emailVerified === true`.

### 4.2 Allowlist

- `ALLOWED_EMAILS` is a server-only, comma-separated Lakebed environment variable.
- Comparison trims whitespace and lowercases both configured and authenticated email addresses.
- A request is authorized only when the current verified email exactly matches one configured entry.
- Every server query that can return project or ticket data enforces this check. Client-side hiding is not an authorization boundary.
- An authenticated but unlisted user sees an access-denied state and a sign-out action, with no project or ticket payload.
- Removing an email and redeploying revokes that address on subsequent access.

This deliberately accepts Lakebed's documented warning that email is profile data rather than an immutable authorization key. It is an explicit simplicity tradeoff for this small internal MVP.

## 5. Information model

### 5.1 Snapshot

The ingestion workload sends one complete snapshot:

```ts
type Snapshot = {
  version: 1;
  projects: ProjectInput[];
};

type ProjectInput = {
  slug: string;
  name: string;
  tickets: TicketInput[];
};

type TicketInput = {
  key: string;
  title: string;
  status: "open" | "in_progress" | "in_review" | "needs_human" | "done";
  tags: string[];
};
```

No rank is present in the public contract. Array position is canonical:

- `projects[0]` is the first top-bar project.
- `project.tickets[0]` is the first displayed ticket for that project.
- Tag order is also preserved.

### 5.2 Validation limits

A snapshot must satisfy all of the following:

- At most 10 projects.
- At most 500 tickets across all projects.
- Project `slug`: 1–48 characters, matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Project `name`: 1–80 visible characters after trimming.
- Project slugs are unique within the snapshot.
- Ticket `key`: 1–32 visible characters after trimming.
- Ticket `title`: 1–240 visible characters after trimming.
- Ticket keys are unique within their project.
- Each ticket has at most 8 tags.
- Each tag is 1–32 visible characters after trimming.
- A ticket cannot contain duplicate tags after case-insensitive comparison.
- Status must be one of the five exact values in the contract.
- The body must be valid JSON with `version: 1` and no missing required fields.

Validation failure rejects the complete request. No partial snapshot is committed. Strings are trimmed before storage; their original capitalization is otherwise preserved.

## 6. Lakebed persistence

Lakebed is the only runtime and source of truth in this phase.

### 6.1 Tables

The capsule uses two tables:

**Projects**

- Source slug
- Display name
- Internal order key

**Tickets**

- Project reference
- Ticket key
- Title
- Status
- Tags encoded as JSON
- Internal order key

Internal order keys are derived from incoming array indexes as fixed-width, zero-padded strings. They are implementation details and never appear in the ingestion contract or interface. Indexes support ascending project order and ascending ticket order within a project.

### 6.2 Replacement semantics

- A successful ingestion deletes existing tickets, then projects, and inserts the new snapshot in one Lakebed endpoint transaction.
- The transaction is all-or-nothing.
- An empty `projects` array is valid and clears the board.
- Only the current state is retained.
- Stable row IDs across snapshots are not required.

## 7. Ingestion API

### 7.1 Endpoint

```http
PUT /api/v1/snapshot
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json
```

`INGEST_TOKEN` is a high-entropy server-only environment variable. The token must never be included in client code, logs, responses, or repository files.

### 7.2 Responses

Successful replacement:

```json
{
  "ok": true,
  "projects": 3,
  "tickets": 42
}
```

Expected failures:

- `400` — malformed JSON or invalid request shape.
- `401` — missing or invalid bearer token.
- `413` — project or ticket count exceeds the supported snapshot size.
- `422` — structurally valid snapshot with invalid or duplicate values.
- `500` — unexpected server or storage failure; the previous snapshot remains intact.

The endpoint should log only the result, project count, ticket count, and validation category. It must not log the bearer token or full snapshot.

### 7.3 Live publication

Lakebed endpoint writes publish affected subscribed queries after commit. Connected authorized clients therefore receive the new ordered board automatically without polling or reloading. Failed ingestion must publish nothing.

## 8. Client experience

### 8.1 Application shell

- Product name: **Looper**.
- Dark, refined monochrome presentation.
- Near-black background, warm off-white primary text, muted secondary text, fine terminal/ASCII structure, and restrained status color.
- Monospace typography throughout.
- WebTUI is loaded from an exact pinned jsDelivr version; small product-specific overrides live as raw CSS in JSX.
- The capsule does not import WebTUI or any other arbitrary npm package.

### 8.2 Authentication states

1. **Checking session:** quiet shell with a minimal loading indication.
2. **Signed out:** Looper title, one short access message, and the Google sign-in control.
3. **Access denied:** concise denial message, current signed-in email, and sign-out action.
4. **Authorized:** project selector and selected project's ordered tickets.

Board data must never be briefly rendered while authorization is unresolved or denied.

### 8.3 Project selector

- Projects appear as simple hypertext-style controls in canonical snapshot order.
- Selecting a project changes local component state without changing the URL.
- The active project is visually distinct through text treatment rather than a large tab or button.
- On initial load, the first project is selected.
- When a live snapshot arrives, preserve selection by project slug when that slug remains present; otherwise select the first project.
- The selector wraps or horizontally scrolls gracefully on narrow screens.

### 8.4 Ticket list

Each row displays only:

1. Ticket key
2. Ticket title
3. Tags
4. Status

Behavior and presentation:

- Rows render in canonical snapshot order.
- No order number or rank is displayed.
- Tags use quiet monochrome WebTUI badge treatment.
- Status is right-aligned on wider screens and moves beneath the title on narrow screens.
- Status labels shown to users are `OPEN`, `IN PROGRESS`, `IN REVIEW`, `NEEDS HUMAN`, and `DONE`.
- Color is secondary to text; every status remains distinguishable without color.
- Ticket rows are not clickable.
- Keyboard focus appears only on actual controls such as project selection and sign-out.

### 8.5 Empty and failure states

- No projects: `No projects in the current snapshot.`
- Selected project with no tickets: `No tickets in this project.`
- Query/runtime failure: a compact terminal-style error with a retry action.
- Live reconnection should preserve the last selected project whenever possible.

### 8.6 Responsive and accessible behavior

- Fully usable from 360 px mobile width through large desktop screens.
- Semantic navigation, lists, headings, and buttons/links are required.
- Visible keyboard focus is required.
- Text and status contrast must meet WCAG AA.
- Motion is unnecessary; respect reduced-motion settings if any transition is introduced.

## 9. Repository and tooling

The repository is a Lakebed capsule with normal Lakebed boundaries:

```text
client/index.tsx
server/index.ts
shared/
favicon.svg
.env.lakebed.server   # untracked
```

Development tooling may be installed at the repository root but must never be imported by capsule code:

- Oxlint for linting.
- Oxfmt for formatting.
- Ultracite configured for the Oxlint/Oxfmt toolchain.
- Lefthook for Git hooks.

Expected commands:

- `npm run dev` — start `npx lakebed dev`.
- `npm run check` — run Ultracite/Oxlint and formatting checks.
- `npm run format` — apply Oxfmt-compatible fixes.
- `npm run build` — compile the Lakebed anonymous artifact as a validation step.

Lefthook runs fast formatting and lint checks before commit. Lockfiles and tool configuration are committed. `.lakebed/`, `.env.lakebed.server`, and secrets are ignored.

## 10. Configuration and deployment

Required server environment:

```dotenv
ALLOWED_EMAILS=person@example.com,other@example.com
INGEST_TOKEN=<high-entropy-secret>
```

Because Looper uses non-empty server environment configuration, it requires a claimed Lakebed deployment:

1. Authenticate with Lakebed.
2. Claim/create the owned deployment.
3. Deploy the capsule and sync server environment.
4. Optionally reserve an available `*.lakebed.app` subdomain using `looper` as the preferred product slug.
5. Verify an allowed and denied Google account before sharing the URL.
6. Send a valid initial snapshot through the ingestion endpoint.

Lakebed is alpha and currently publishes no formal long-term pricing guarantee. This is an accepted platform risk for the MVP.

## 11. Acceptance criteria

The MVP is complete when all of the following are demonstrated:

1. A guest cannot receive project or ticket data and can initiate Google sign-in.
2. A signed-in account with an unverified or unlisted email cannot receive board data.
3. A listed, verified account can view the first project and switch projects locally.
4. Projects, tickets, and tags appear in exactly the order supplied by ingestion.
5. All five statuses render with exact human-readable labels.
6. A valid bearer-authenticated snapshot atomically replaces the prior snapshot.
7. An invalid or unauthorized ingestion leaves the prior snapshot unchanged.
8. A successful ingestion updates an already-open authorized client without manual refresh.
9. Project selection survives a live update when the selected slug remains; otherwise it falls back to the first project.
10. Empty-board and empty-project states render cleanly.
11. The interface is keyboard-usable, readable at 360 px, and meets AA contrast.
12. WebTUI is loaded from a pinned version and failure of decorative styling does not expose or corrupt data.
13. Oxlint, Oxfmt, Ultracite, Lefthook, and the Lakebed build all pass in a clean checkout.

## 12. Known risks and deliberate tradeoffs

- **Email authorization:** simpler to operate, but weaker than Lakebed's recommended immutable user-ID authorization.
- **Complete replacement:** ideal at the agreed maximum of 10 projects and 500 tickets, but not intended for large boards.
- **Pinned CDN CSS:** easy under Lakebed's package restrictions, but introduces a runtime dependency on jsDelivr.
- **Lakebed alpha:** APIs, limits, availability, and future pricing may change.
- **No history:** a bad but valid snapshot immediately replaces the previous state; correction requires another ingestion.
