# Looper

Private, read-only ticket viewer for small teams. Another workload prepares a complete ordered snapshot; Looper displays it in a refined terminal-inspired interface and pushes committed changes to authorized viewers.

This guide is for operators who need to configure, deploy, feed, and verify Looper without reading implementation internals. Product and technical detail lives in [`SPEC.md`](./SPEC.md).

## Prerequisites

- Node.js 20+ and npm
- Network access to Lakebed (`api.lakebed.dev`) for hosted deploys
- A Google account for Lakebed CLI authentication and for viewer sign-in
- An external workload (or `curl`) that can `PUT` JSON to the ingestion endpoint

## Quick start (local)

```sh
# 1. Install repository tooling (Oxlint, Oxfmt, Ultracite, Lefthook)
npm ci

# 2. Configure server-only secrets (never commit this file)
cp .env.lakebed.server.example .env.lakebed.server
# Edit .env.lakebed.server:
#   ALLOWED_EMAILS=you@example.com
#   INGEST_TOKEN=<output of: openssl rand -hex 32>

# 3. Start the capsule
npm run dev
# → http://localhost:3000
```

Local auth uses Lakebed's built-in Google sign-in. For guest-only shell checks without Google, open the app as a guest; you will only see the sign-in screen and no board data.

Inspect local runtime state while `npm run dev` is running:

```sh
npx lakebed db list --port 3000
npx lakebed db dump --port 3000
npx lakebed logs --port 3000
```

Local state resets when the dev server restarts.

## Quality checks (clean checkout)

From a fresh clone with no local mutations:

```sh
npm ci
npm run check    # Ultracite / Oxlint + formatting checks
npm run build    # Lakebed anonymous artifact validation build
```

Optional formatting fix:

```sh
npm run format
```

Git hooks (Lefthook) install via `npm ci` / `npm install` through the `prepare` script. Pre-commit runs `npx ultracite fix` on staged source files.

Expected result on a clean tree: `check` and `build` both exit 0.

## Server environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `ALLOWED_EMAILS` | yes | Comma-separated Google emails allowed to view the board |
| `INGEST_TOKEN` | yes | Bearer token for `PUT /api/v1/snapshot` |

Template: [`.env.lakebed.server.example`](./.env.lakebed.server.example)

Rules:

- Values live only in `.env.lakebed.server` (gitignored).
- Comparison for emails trims whitespace and lowercases both sides.
- The ingest token must never appear in client code, repository files, responses, or logs.
- Hosted env sync replaces the entire hosted env with the local file contents after a deploy is claimed.

Generate a strong ingest token:

```sh
openssl rand -hex 32
```

## Deploy to Lakebed

Looper requires a **claimed** Lakebed deployment because it uses non-empty server environment configuration (`ALLOWED_EMAILS`, `INGEST_TOKEN`). Anonymous deploys will not receive those secrets.

### 1. Authenticate with Lakebed

```sh
npx lakebed auth login
npx lakebed auth status
```

You must complete this interactively in a browser. If `auth status` reports `"authenticated": false`, stop here — deployment cannot finish without a Lakebed login session (or a `LAKEBED_TOKEN` created after login).

### 2. First deploy and claim

From the capsule root:

```sh
# Preferred: login first so the deploy is owned from the start
npx lakebed auth login
npx lakebed deploy

# If you deployed while unauthenticated, Lakebed may create an anonymous
# claim-required deploy. That URL serves a claim page, does not expose the
# ingestion endpoint or board API, and does not sync server env. Claim it,
# then redeploy:
npx lakebed claim
npx lakebed deploy
```

Confirm claim status from the deploy JSON output (`claimed: true`) or by loading the app URL (it must render Looper, not a "Claim Required" page).

Owned deploys write `lakebed.json` containing only `deployId`. Commit that file so future checkouts update the same app. Local anonymous claim material under `.lakebed/` is gitignored and must not be committed.

### 3. Sync server environment

After the deploy is claimed, every `npx lakebed deploy` uploads the current `.env.lakebed.server` contents. Removing a key from the file removes it from the hosted deploy. Until claim succeeds, hosted `ALLOWED_EMAILS` and `INGEST_TOKEN` are not available to the app.

Verify logs after deploy:

```sh
npx lakebed logs <deploy-id-or-url>
```

### 4. Optional subdomain

Preferred product slug: `looper`.

```sh
npx lakebed domains add looper.lakebed.app
```

If `looper` is taken, choose another available `*.lakebed.app` name. Reserved names such as `api`, `admin`, `docs`, and `www` cannot be registered.

### 5. CI / automation token (optional)

```sh
npx lakebed token create --name looper-ci
# Supply the returned secret once as LAKEBED_TOKEN in CI.
```

## Ingestion API

### Endpoint

```http
PUT /api/v1/snapshot
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json
```

Local example base URL: `http://localhost:3000`  
Hosted example base URL: `https://<your-subdomain>.lakebed.app` or the deploy URL printed by `npx lakebed deploy`.

### Valid complete snapshot (copyable)

Save as `snapshot.example.json` or pipe inline:

```json
{
  "version": 1,
  "projects": [
    {
      "slug": "looper",
      "name": "Looper",
      "tickets": [
        {
          "key": "LOOP-1",
          "title": "Prepare operator deployment docs",
          "status": "in_review",
          "tags": ["docs", "ops"]
        },
        {
          "key": "LOOP-2",
          "title": "Verify allowlist and live updates",
          "status": "open",
          "tags": ["qa"]
        }
      ]
    },
    {
      "slug": "platform",
      "name": "Platform",
      "tickets": [
        {
          "key": "PLAT-9",
          "title": "Rotate ingest token after first deploy",
          "status": "needs_human",
          "tags": ["security"]
        },
        {
          "key": "PLAT-10",
          "title": "Empty project stays visible in selector",
          "status": "done",
          "tags": []
        }
      ]
    },
    {
      "slug": "inbox",
      "name": "Inbox",
      "tickets": []
    }
  ]
}
```

Constraints (rejected entirely on failure):

- At most 10 projects and 500 tickets total
- Project `slug`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–48 chars, unique in the snapshot
- Project `name`: 1–80 visible characters after trim
- Ticket `key`: 1–32 chars after trim, unique within its project
- Ticket `title`: 1–240 chars after trim
- Status one of: `open`, `in_progress`, `in_review`, `needs_human`, `done`
- At most 8 tags per ticket; each tag 1–32 chars; no case-insensitive duplicates
- Array order is canonical for projects, tickets, and tags

An empty `projects` array is valid and clears the board.

### Bearer-authenticated ingestion (copyable)

```sh
# Local
curl -sS -X PUT "http://localhost:3000/api/v1/snapshot" \
  -H "Authorization: Bearer ${INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @snapshot.example.json

# Hosted
curl -sS -X PUT "https://looper.lakebed.app/api/v1/snapshot" \
  -H "Authorization: Bearer ${INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @snapshot.example.json
```

Success response:

```json
{
  "ok": true,
  "projects": 3,
  "tickets": 4
}
```

Clear the board:

```sh
curl -sS -X PUT "http://localhost:3000/api/v1/snapshot" \
  -H "Authorization: Bearer ${INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"version":1,"projects":[]}'
```

### Response codes and recovery

| Status | Meaning | Operator recovery |
| --- | --- | --- |
| `200` | Snapshot committed; counts returned | None. Connected authorized clients update live. |
| `400` | Malformed JSON or invalid request shape (wrong version, missing fields, wrong types) | Fix the payload structure. Previous snapshot remains. |
| `401` | Missing/invalid bearer token, or `INGEST_TOKEN` unset | Confirm `Authorization: Bearer …` matches `.env.lakebed.server`. Redeploy after fixing env on hosted. Previous snapshot remains. |
| `413` | More than 10 projects or 500 tickets | Split or reduce the snapshot. Previous snapshot remains. |
| `422` | Structurally valid JSON with invalid/duplicate values (slug, status, tags, uniqueness, lengths) | Fix the reported validation message. Previous snapshot remains. |
| `500` | Unexpected server/storage failure | Retry once. Inspect `npx lakebed logs`. Previous snapshot remains if the transaction did not commit. |

Failed ingestion never partially replaces the board and publishes no live update.

### Ingestion logging

Successful commits log outcome plus project and ticket counts only. Rejections log outcome and validation category (`unauthorized`, `malformed`, `too_large`, `invalid`, `server_error`). Logs must not include the bearer token or the full snapshot body.

Inspect:

```sh
# Local
npx lakebed logs --port 3000

# Hosted
npx lakebed logs <deploy-id-or-url>
```

## Operator smoke checklist

Run after local setup or a hosted deploy. Check each box before sharing the URL.

### Access control

- [ ] **Signed out:** open the app in a private window → Looper shell, short access message, Google sign-in only. No project or ticket data.
- [ ] **Denied:** sign in with a verified Google account **not** on `ALLOWED_EMAILS` → access denied message, signed-in email, sign-out. No board payload.
- [ ] **Allowed:** sign in with a listed, verified email → authorized board (empty or populated). Sign-out works.

### Board states

- [ ] **Empty board:** ingest `{"version":1,"projects":[]}` → authorized viewer sees `No projects in the current snapshot.` and no project selector.
- [ ] **Populated board:** ingest the sample snapshot above → first project selected; tickets show key, title, tags, and status labels `OPEN` / `IN PROGRESS` / `IN REVIEW` / `NEEDS HUMAN` / `DONE`.
- [ ] **Empty project:** select `Inbox` → `No tickets in this project.`
- [ ] **Project switching:** activate another project control → ticket list changes; browser URL does not.

### Live update

- [ ] Keep an authorized tab open on project `looper`.
- [ ] Ingest a modified snapshot that still includes `looper` → the open tab updates without manual refresh; selection stays on `looper`.
- [ ] Ingest a snapshot that removes `looper` → selection falls back to the first remaining project.
- [ ] Send a deliberately invalid or unauthorized ingest → open tab unchanged.

### Ingestion failures

- [ ] Missing `Authorization` header → `401`; board unchanged.
- [ ] Body `{ "version": 2, "projects": [] }` → `400`; board unchanged.
- [ ] Duplicate project slug or bad status → `422`; board unchanged.
- [ ] 11 projects → `413`; board unchanged.

### Presentation sanity

- [ ] Usable at ~360 px width and on a wide desktop.
- [ ] Keyboard can reach project controls, sign-in/out, and retry (when shown); focus rings are visible.
- [ ] Status remains readable if color is ignored (labels differ by text).

## Secret rotation

### Rotate `INGEST_TOKEN`

1. Generate a new token: `openssl rand -hex 32`.
2. Update `.env.lakebed.server` with the new value.
3. Redeploy so hosted env replaces the previous token: `npx lakebed deploy`.
4. Update every ingestion workload with the new bearer value.
5. Confirm old token returns `401` and the new token commits successfully.
6. Treat the old token as compromised; do not log either value.

### Revoke or change an allowlisted email

1. Edit `ALLOWED_EMAILS` in `.env.lakebed.server` (remove or replace the address).
2. Redeploy: `npx lakebed deploy`.
3. On next access, the removed account receives the access-denied state and no board data.
4. Ask the user to sign out if a session is still open; subsequent queries re-check the allowlist.

There is no in-app admin UI for access control. Email allowlisting is an intentional MVP tradeoff (see risks below).

## Accepted risks

Operators should know these deliberate tradeoffs before relying on Looper in production:

1. **Email-based authorization** — access is gated by verified Google email matching `ALLOWED_EMAILS`, not by immutable user IDs. Simpler to operate; weaker if an email is recycled or spoofed at the identity provider.
2. **Pinned CDN styling** — WebTUI CSS loads from a pinned jsDelivr URL. Decorative styling can fail without exposing or corrupting board data, but presentation then falls back to product CSS only.
3. **Complete snapshot replacement** — every successful ingest deletes and rewrites the full board. Ideal at ≤10 projects / ≤500 tickets; a bad-but-valid snapshot immediately replaces the previous state with no history or rollback.
4. **Lakebed alpha hosting** — APIs, limits, availability, and pricing may change. Claimed deploys are required for server env; unclaimed anonymous deploys expire.

## Repository layout

```text
client/index.tsx          # Preact UI
server/index.ts           # schema, queries, ingestion endpoint
shared/                   # pure shared types and validation
favicon.svg
.env.lakebed.server       # untracked secrets (local + deploy source)
.env.lakebed.server.example
package.json              # npm run dev | check | format | build
SPEC.md                   # product and technical specification
README.md                 # this operator guide
```

## Commands reference

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local Lakebed capsule (`npx lakebed dev`) |
| `npm run check` | Lint and format checks (Ultracite / Oxlint / Oxfmt) |
| `npm run format` | Apply formatting and autofixes |
| `npm run build` | Compile anonymous Lakebed artifact for validation |
| `npx lakebed deploy` | Publish capsule; sync env when claimed |
| `npx lakebed claim` | Claim an anonymous deploy for owned use |
| `npx lakebed auth login` | Authenticate the Lakebed CLI |
| `npx lakebed auth status` | Show CLI authentication state |
| `npx lakebed domains add <name>.lakebed.app` | Reserve a Lakebed subdomain |
| `npx lakebed logs [--port 3000 \| <deploy>]` | Inspect ingestion and runtime logs |
| `npx lakebed db dump [--port 3000 \| <deploy>]` | Inspect stored projects/tickets |

## Deployment readiness checklist

- [x] Safe env template without real credentials
- [x] Operator docs for local dev, checks, build, claim, env sync, subdomain
- [x] Copyable snapshot and `curl` ingestion examples
- [x] Documented HTTP recovery paths for auth/validation/size/server errors
- [x] Smoke checklist for access, empty/populated board, switching, live updates
- [x] Secret rotation and email revocation procedures
- [x] Logging contract: outcomes and counts only
- [x] Accepted risks called out for operators

**Blocked until an operator completes interactively:**

1. `npx lakebed auth login` (CLI is currently unauthenticated)
2. Claimed `npx lakebed deploy` with a real `.env.lakebed.server`
3. Optional `npx lakebed domains add looper.lakebed.app`
4. Hosted smoke against allowed and denied Google accounts
5. First production snapshot from the external ingestion workload
