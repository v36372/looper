import {
  ErrorBoundary,
  SignInWithGoogle,
  signOut,
  useAuth,
  useQuery,
} from "lakebed/client";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

import type { SessionSnapshot } from "../shared/access";
import type {
  BoardProject,
  BoardSnapshot,
  BoardTicket,
  TicketStatus,
} from "../shared/snapshot";
import { statusLabel } from "../shared/snapshot";

const WEBTUI_CSS =
  "https://cdn.jsdelivr.net/npm/@webtui/css@0.1.9/dist/full.css";

const PRODUCT_CSS = `
  :root {
    color-scheme: dark;
    --looper-bg: #0b0b0c;
    --looper-panel: #111113;
    --looper-border: #2a2a2e;
    --looper-text: #f4f1ea;
    --looper-muted: #a8a39a;
    --looper-faint: #8f8a80;
    --looper-focus: #f4f1ea;
    --looper-danger: #e0cfc0;
    --looper-status-open: #cfc8bb;
    --looper-status-progress: #b7c7b0;
    --looper-status-review: #b7c0cf;
    --looper-status-human: #d4b48c;
    --looper-status-done: #a39e94;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    min-height: 100%;
  }

  body {
    margin: 0;
    background: var(--looper-bg);
    color: var(--looper-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  a {
    color: inherit;
  }

  .looper-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.03), transparent 34%),
      var(--looper-bg);
  }

  .looper-frame {
    width: min(100%, 56rem);
    margin: 0 auto;
    padding: 1.25rem 0.85rem 2.5rem;
  }

  @media (min-width: 640px) {
    .looper-frame {
      padding: 2.5rem 1.5rem 4rem;
    }
  }

  .looper-topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.85rem 1.25rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--looper-border);
  }

  @media (min-width: 760px) {
    .looper-topbar {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: baseline;
      margin-bottom: 2rem;
    }
  }

  .looper-brand {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .looper-account {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem 0.75rem;
    min-width: 0;
    max-width: 14rem;
  }

  .looper-account .looper-meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .looper-account-button {
    flex: 0 0 auto;
    border: 0;
    padding: 0.2rem 0;
    color: var(--looper-muted);
    font-size: 0.75rem;
    text-transform: lowercase;
  }

  @media (min-width: 760px) {
    .looper-account {
      grid-column: 3;
      max-width: 22rem;
    }
  }

  .looper-title {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  @media (min-width: 640px) {
    .looper-title {
      font-size: 1.125rem;
    }
  }

  .looper-subtitle {
    margin: 0;
    color: var(--looper-muted);
    font-size: 0.8125rem;
  }

  .looper-panel {
    border: 1px solid var(--looper-border);
    background: color-mix(in srgb, var(--looper-panel) 92%, black);
    padding: 1rem;
  }

  @media (min-width: 640px) {
    .looper-panel {
      padding: 1.75rem;
    }
  }

  .looper-kicker {
    margin: 0 0 0.75rem;
    color: var(--looper-faint);
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .looper-copy {
    margin: 0;
    color: var(--looper-text);
    line-height: 1.6;
  }

  .looper-muted {
    color: var(--looper-muted);
  }

  .looper-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .looper-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .looper-meta {
    margin: 0;
    color: var(--looper-muted);
    font-size: 0.8125rem;
    word-break: break-word;
  }

  .looper-button,
  .looper-sign-in {
    appearance: none;
    border: 1px solid var(--looper-border);
    background: transparent;
    color: var(--looper-text);
    font: inherit;
    font-size: 0.875rem;
    letter-spacing: 0.04em;
    padding: 0.55rem 0.9rem;
    cursor: pointer;
  }

  .looper-button:hover,
  .looper-sign-in:hover {
    border-color: var(--looper-text);
  }

  .looper-button:focus-visible,
  .looper-sign-in:focus-visible,
  .looper-project-link:focus-visible,
  .looper-ticket-toggle:focus-visible {
    outline: 2px solid var(--looper-focus);
    outline-offset: 2px;
  }

  .looper-empty,
  .looper-error {
    border: 1px dashed var(--looper-border);
    padding: 1rem 1.1rem;
    color: var(--looper-muted);
  }

  .looper-error {
    border-style: solid;
    border-color: color-mix(in srgb, var(--looper-danger) 45%, var(--looper-border));
    color: var(--looper-text);
  }

  .looper-error-title {
    margin: 0 0 0.55rem;
    color: var(--looper-danger);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .looper-error-message {
    margin: 0 0 1rem;
    color: var(--looper-muted);
    font-size: 0.875rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .looper-ascii {
    margin: 0 0 1rem;
    color: var(--looper-faint);
    font-size: 0.75rem;
    white-space: pre;
    overflow-x: auto;
  }

  .looper-board-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem 1.25rem;
    margin-bottom: 1.25rem;
  }

  .looper-project-nav {
    grid-column: 1 / -1;
    grid-row: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: flex-start;
    gap: 0.45rem 0.95rem;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 0.15rem;
  }

  @media (min-width: 760px) {
    .looper-project-nav {
      grid-column: 2;
      grid-row: 1;
      justify-content: flex-end;
    }
  }

  .looper-project-link {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--looper-muted);
    font: inherit;
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.22em;
    padding: 0.2rem 0;
    cursor: pointer;
    white-space: nowrap;
  }

  .looper-project-link:hover {
    color: var(--looper-text);
  }

  .looper-project-link[aria-current="true"] {
    color: var(--looper-text);
    text-decoration: none;
    font-weight: 600;
  }

  .looper-project-name {
    margin: 0;
    font-size: 0.95rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }

  @media (min-width: 640px) {
    .looper-project-name {
      font-size: 1rem;
    }
  }

  .looper-ticket-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .looper-ticket {
    border: 1px solid var(--looper-border);
    background: color-mix(in srgb, var(--looper-panel) 80%, black);
  }

  .looper-ticket-toggle {
    appearance: none;
    display: block;
    width: 100%;
    margin: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 0.85rem 0.9rem;
    cursor: pointer;
  }

  .looper-ticket-toggle:hover {
    background: color-mix(in srgb, var(--looper-panel) 70%, white 4%);
  }

  .looper-ticket-main {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .looper-ticket-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .looper-ticket-key-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.45rem 0.85rem;
  }

  .looper-ticket-key {
    margin: 0;
    color: var(--looper-muted);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .looper-ticket-expand-hint {
    margin: 0;
    color: var(--looper-faint);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .looper-ticket-title {
    margin: 0;
    color: var(--looper-text);
    font-size: 0.92rem;
    font-weight: 500;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .looper-status {
    display: inline-flex;
    width: max-content;
    align-items: center;
    justify-content: center;
    margin: 0;
    border: 1px solid currentColor;
    background: color-mix(in srgb, currentColor 7%, transparent);
    color: var(--looper-muted);
    padding: 0.18rem 0.45rem;
    font-size: 0.7rem;
    line-height: 1.2;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .looper-status[data-status="open"] {
    color: var(--looper-status-open);
  }

  .looper-status[data-status="in_progress"] {
    color: var(--looper-status-progress);
  }

  .looper-status[data-status="in_review"] {
    color: var(--looper-status-review);
  }

  .looper-status[data-status="needs_human"] {
    color: var(--looper-status-human);
  }

  .looper-status[data-status="done"] {
    color: var(--looper-status-done);
  }

  .looper-ticket-details {
    border-top: 1px solid var(--looper-border);
    margin: 0;
    padding: 0.85rem 0.9rem 0.95rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .looper-ticket-detail-block {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .looper-ticket-detail-label {
    margin: 0;
    color: var(--looper-faint);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .looper-ticket-description {
    margin: 0;
    color: var(--looper-text);
    font-size: 0.875rem;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .looper-ticket-description[data-empty="true"] {
    color: var(--looper-muted);
    font-style: italic;
  }

  /* Status sits under the title on narrow screens; right-aligned on wider ones. */
  @media (min-width: 720px) {
    .looper-ticket-main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.75rem 1.25rem;
      align-items: start;
    }

    .looper-ticket-main > .looper-status {
      justify-self: end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
`;

const useWebTuiStylesheet = () => {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>(
      'link[data-looper-webtui="true"]'
    );
    if (existing) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = WEBTUI_CSS;
    link.dataset.looperWebtui = "true";
    // Decorative CDN styling must never block or corrupt board data if it fails.
    const onStylesheetError = () => {
      link.remove();
    };
    link.addEventListener("error", onStylesheetError);
    document.head.append(link);

    return () => {
      link.removeEventListener("error", onStylesheetError);
    };
  }, []);
};

const Shell = ({
  account,
  children,
  nav,
}: {
  account?: ComponentChildren;
  children: ComponentChildren;
  nav?: ComponentChildren;
}) => (
  <div className="looper-shell">
    <style>{PRODUCT_CSS}</style>
    <div className="looper-frame">
      <header className="looper-topbar">
        <div className="looper-brand">
          <h1 className="looper-title">Looper</h1>
          <p className="looper-subtitle">private ticket viewer</p>
        </div>
        {nav}
        {account}
      </header>
      <main>{children}</main>
    </div>
  </div>
);

const AccountControl = ({ email }: { email: string | null }) => (
  <div className="looper-account">
    {email ? (
      <p className="looper-meta" title={`signed in as ${email}`}>
        signed in as <span>{email}</span>
      </p>
    ) : null}
    <button
      className="looper-button looper-account-button"
      type="button"
      onClick={() => signOut()}
    >
      sign out
    </button>
  </div>
);

const LoadingState = ({ label = "Checking session…" }: { label?: string }) => (
  <section aria-busy="true" aria-live="polite" className="looper-panel">
    <p className="looper-kicker">session</p>
    <p className="looper-copy looper-muted">{label}</p>
  </section>
);

const SignedOutState = () => (
  <section className="looper-panel" aria-labelledby="looper-signin-heading">
    <pre aria-hidden="true" className="looper-ascii">{`+------------------+
| access required  |
+------------------+`}</pre>
    <p className="looper-kicker" id="looper-signin-heading">
      sign in
    </p>
    <div className="looper-stack">
      <p className="looper-copy">
        Looper is a private board. Sign in with Google to continue.
      </p>
      <div className="looper-actions">
        <SignInWithGoogle className="looper-sign-in" />
      </div>
    </div>
  </section>
);

const AccessDeniedState = () => (
  <section className="looper-panel" aria-labelledby="looper-denied-heading">
    <p className="looper-kicker" id="looper-denied-heading">
      access denied
    </p>
    <p className="looper-copy">This account is not on the Looper allowlist.</p>
  </section>
);

const EmptyBoardState = () => (
  <section
    className="looper-panel"
    aria-labelledby="looper-empty-board-heading"
  >
    <p className="looper-kicker" id="looper-empty-board-heading">
      board
    </p>
    <div className="looper-empty" role="status">
      No projects in the current snapshot.
    </div>
  </section>
);

const QueryErrorState = ({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) => (
  <Shell>
    <section
      aria-labelledby="looper-error-heading"
      className="looper-panel"
      role="alert"
    >
      <pre aria-hidden="true" className="looper-ascii">{`+------------------+
| query failed     |
+------------------+`}</pre>
      <div className="looper-error">
        <h2 className="looper-error-title" id="looper-error-heading">
          runtime error
        </h2>
        <p className="looper-error-message">
          {error.message || "Unable to load the board."}
        </p>
        <div className="looper-actions">
          <button className="looper-button" type="button" onClick={onRetry}>
            Retry
          </button>
          <button
            className="looper-button"
            type="button"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
    </section>
  </Shell>
);

const TicketRow = ({ ticket }: { ticket: BoardTicket }) => {
  const status = ticket.status as TicketStatus;
  const [expanded, setExpanded] = useState(false);
  const detailsId = `ticket-details-${ticket.key}`;
  const description =
    typeof ticket.description === "string" ? ticket.description.trim() : "";
  const hasDescription = description.length > 0;

  return (
    <li className="looper-ticket">
      <button
        aria-controls={detailsId}
        aria-expanded={expanded}
        className="looper-ticket-toggle"
        type="button"
        onClick={() => setExpanded((current) => !current)}
      >
        <article aria-label={ticket.key} className="looper-ticket-main">
          <div className="looper-ticket-body">
            <div className="looper-ticket-key-row">
              <p className="looper-ticket-key">{ticket.key}</p>
              <p className="looper-ticket-expand-hint">
                {expanded ? "collapse" : "details"}
              </p>
            </div>
            <h3 className="looper-ticket-title">{ticket.title}</h3>
          </div>
          {/* Sibling of body: stacks under title on narrow screens, right column on wide. */}
          <p className="looper-status" data-status={status}>
            {statusLabel(status)}
          </p>
        </article>
      </button>

      {expanded ? (
        <div
          className="looper-ticket-details"
          id={detailsId}
          role="region"
          aria-label={`${ticket.key} details`}
        >
          <div className="looper-ticket-detail-block">
            <p className="looper-ticket-detail-label">Status</p>
            <p className="looper-status" data-status={status}>
              {statusLabel(status)}
            </p>
          </div>
          <div className="looper-ticket-detail-block">
            <p className="looper-ticket-detail-label">Description</p>
            <p
              className="looper-ticket-description"
              data-empty={hasDescription ? "false" : "true"}
            >
              {hasDescription ? description : "No description."}
            </p>
          </div>
        </div>
      ) : null}
    </li>
  );
};

const ProjectSelector = ({
  projects,
  selectedSlug,
  onSelect,
}: {
  onSelect: (slug: string) => void;
  projects: BoardProject[];
  selectedSlug: string;
}) => (
  <nav aria-label="Projects" className="looper-project-nav">
    {projects.map((project) => {
      const isActive = project.slug === selectedSlug;

      return (
        <button
          aria-current={isActive ? "true" : undefined}
          aria-pressed={isActive}
          className="looper-project-link"
          key={project.slug}
          type="button"
          onClick={() => onSelect(project.slug)}
        >
          {project.name}
        </button>
      );
    })}
  </nav>
);

const ProjectBoard = ({ project }: { project: BoardProject }) => (
  <section aria-labelledby="looper-project-heading" className="looper-panel">
    <div className="looper-board-header">
      <div>
        <p className="looper-kicker">project</p>
        <h2 className="looper-project-name" id="looper-project-heading">
          {project.name}
        </h2>
      </div>
    </div>

    {project.tickets.length === 0 ? (
      <div className="looper-empty" role="status">
        No tickets in this project.
      </div>
    ) : (
      <ul aria-label={`${project.name} tickets`} className="looper-ticket-list">
        {project.tickets.map((ticket) => (
          <TicketRow key={ticket.key} ticket={ticket} />
        ))}
      </ul>
    )}
  </section>
);

const resolveSelectedProject = (
  projects: BoardProject[],
  selectedSlug: string | null
): BoardProject | null => {
  if (projects.length === 0) {
    return null;
  }

  if (selectedSlug) {
    const matched = projects.find((project) => project.slug === selectedSlug);
    if (matched) {
      return matched;
    }
  }

  return projects[0] ?? null;
};

const AuthorizedBoard = ({ email }: { email: string | null }) => {
  const board = useQuery<BoardSnapshot | null>("board");
  // Local-only project selection: never write to the browser URL.
  // Survives reconnection and live snapshot updates when the slug remains.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const projects =
    board && !Array.isArray(board) && Array.isArray(board.projects)
      ? board.projects
      : null;

  // Keep selection sticky across live snapshot updates and reconnection when
  // the slug survives; otherwise fall back to the first project in order.
  useEffect(() => {
    if (!projects || projects.length === 0) {
      if (selectedSlug !== null) {
        setSelectedSlug(null);
      }
      return;
    }

    const stillPresent =
      selectedSlug !== null &&
      projects.some((project) => project.slug === selectedSlug);

    if (stillPresent) {
      return;
    }

    const [firstProject] = projects;
    if (firstProject && selectedSlug !== firstProject.slug) {
      setSelectedSlug(firstProject.slug);
    }
  }, [projects, selectedSlug]);

  // While the authorized board query is still resolving, show a quiet loading
  // shell and never invent ticket content.
  const account = <AccountControl email={email} />;

  if (!projects) {
    return (
      <Shell account={account}>
        <LoadingState label="Loading board…" />
      </Shell>
    );
  }

  // Empty board: agreed message only — no project selector or controls.
  if (projects.length === 0) {
    return (
      <Shell account={account}>
        <EmptyBoardState />
      </Shell>
    );
  }

  const selectedProject = resolveSelectedProject(projects, selectedSlug);
  if (!selectedProject) {
    return (
      <Shell account={account}>
        <EmptyBoardState />
      </Shell>
    );
  }

  return (
    <Shell
      account={account}
      nav={
        <ProjectSelector
          projects={projects}
          selectedSlug={selectedProject.slug}
          onSelect={setSelectedSlug}
        />
      }
    >
      <ProjectBoard project={selectedProject} />
    </Shell>
  );
};

const SessionGate = () => {
  const auth = useAuth();
  const session = useQuery<SessionSnapshot>("session");

  if (auth.isLoading) {
    return (
      <Shell>
        <LoadingState />
      </Shell>
    );
  }

  // Do not render protected content until the server session query resolves to
  // a real object. The legacy useQuery hook falls back to [] while loading.
  if (!session || Array.isArray(session) || !session.access) {
    return (
      <Shell>
        <LoadingState />
      </Shell>
    );
  }

  if (session.access === "guest" || auth.isGuest) {
    return (
      <Shell>
        <SignedOutState />
      </Shell>
    );
  }

  if (session.access === "denied") {
    return (
      <Shell account={<AccountControl email={session.email} />}>
        <AccessDeniedState />
      </Shell>
    );
  }

  return <AuthorizedBoard email={session.email} />;
};

export const App = () => {
  useWebTuiStylesheet();

  return (
    <ErrorBoundary
      fallback={(error, retry) => (
        <QueryErrorState error={error} onRetry={retry} />
      )}
    >
      <SessionGate />
    </ErrorBoundary>
  );
};
