import {
  capsule,
  endpoint,
  id,
  json,
  query,
  string,
  table,
} from "lakebed/server";

import { parseAllowedEmails, resolveAccess } from "../shared/access";
import type { SessionSnapshot } from "../shared/access";
import {
  encodeTagsJson,
  orderKeyFromIndex,
  parseTagsJson,
  validateSnapshot,
} from "../shared/snapshot";
import type {
  BoardProject,
  BoardSnapshot,
  BoardTicket,
  TicketStatus,
} from "../shared/snapshot";

const sessionFor = (ctx: {
  auth: {
    displayName: string;
    email?: string;
    emailVerified?: boolean;
    isGuest: boolean;
  };
  env: { ALLOWED_EMAILS?: string };
}): SessionSnapshot => {
  const allowedEmails = parseAllowedEmails(ctx.env.ALLOWED_EMAILS);
  const access = resolveAccess(ctx.auth, allowedEmails);

  if (access === "guest") {
    return {
      access,
      displayName: null,
      email: null,
    };
  }

  return {
    access,
    displayName: ctx.auth.displayName || null,
    email: ctx.auth.email ?? null,
  };
};

const extractBearerToken = (header: string | null): string | null => {
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(?<token>.+)$/iu.exec(header.trim());
  const token = match?.groups?.token?.trim();
  return token || null;
};

const isAuthorizedIngest = (
  authorizationHeader: string | null,
  configuredToken: string | undefined
): boolean => {
  if (!configuredToken) {
    return false;
  }

  const provided = extractBearerToken(authorizationHeader);
  return provided !== null && provided === configuredToken;
};

const statusForValidationCategory = (
  category: "malformed" | "too_large" | "invalid"
): number => {
  if (category === "too_large") {
    return 413;
  }
  if (category === "malformed") {
    return 400;
  }
  return 422;
};

interface StoredTicketInput {
  key: string;
  status: string;
  tags: string[];
  title: string;
}

interface StoredProjectInput {
  name: string;
  slug: string;
  tickets: StoredTicketInput[];
}

interface BoardDb {
  projects: {
    withIndex: (
      name: string,
      range?: (query: unknown) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<
          {
            id: string;
            name: string;
            slug: string;
          }[]
        >;
      };
    };
  };
  tickets: {
    withIndex: (
      name: string,
      range: (query: {
        eq: (field: string, value: string) => unknown;
      }) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<
          {
            key: string;
            status: string;
            tagsJson: string;
            title: string;
          }[]
        >;
      };
    };
  };
}

interface WriteDb {
  projects: {
    delete: (id: string) => Promise<boolean>;
    insert: (value: {
      name: string;
      orderKey: string;
      slug: string;
    }) => Promise<{ id: string }>;
    withIndex: (
      name: string,
      range?: (query: unknown) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<{ id: string }[]>;
      };
    };
  };
  tickets: {
    delete: (id: string) => Promise<boolean>;
    insert: (value: {
      key: string;
      orderKey: string;
      projectId: string;
      status: string;
      tagsJson: string;
      title: string;
    }) => Promise<unknown>;
    withIndex: (
      name: string,
      range?: (query: unknown) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<{ id: string }[]>;
      };
    };
  };
}

/* eslint-disable no-await-in-loop --
 * Snapshot replacement and board assembly must stay ordered and sequential
 * inside Lakebed's single endpoint/query transaction. Parallel helpers are
 * avoided because the anonymous build treats them as the legacy collect API.
 */
const replaceSnapshot = async (
  db: WriteDb,
  projects: StoredProjectInput[]
): Promise<void> => {
  // Delete tickets first, then projects, then insert the full replacement so a
  // successful commit never leaves a partial board.
  const existingTickets = await db.tickets
    .withIndex("by_creation")
    .order("asc")
    .collect();
  for (const ticket of existingTickets) {
    await db.tickets.delete(ticket.id);
  }

  const existingProjects = await db.projects
    .withIndex("by_creation")
    .order("asc")
    .collect();
  for (const project of existingProjects) {
    await db.projects.delete(project.id);
  }

  for (const [projectIndex, project] of projects.entries()) {
    const projectRow = await db.projects.insert({
      name: project.name,
      orderKey: orderKeyFromIndex(projectIndex),
      slug: project.slug,
    });

    for (const [ticketIndex, ticket] of project.tickets.entries()) {
      await db.tickets.insert({
        key: ticket.key,
        orderKey: orderKeyFromIndex(ticketIndex),
        projectId: projectRow.id,
        status: ticket.status,
        tagsJson: encodeTagsJson(ticket.tags),
        title: ticket.title,
      });
    }
  }
};

const loadBoardProjects = async (ctx: {
  db: BoardDb;
}): Promise<BoardProject[]> => {
  const projectRows = await ctx.db.projects
    .withIndex("by_order")
    .order("asc")
    .collect();

  const projects: BoardProject[] = [];

  for (const project of projectRows) {
    const ticketRows = await ctx.db.tickets
      .withIndex("by_project_order", (q) => q.eq("projectId", project.id))
      .order("asc")
      .collect();

    const tickets: BoardTicket[] = ticketRows.map((ticket) => ({
      key: ticket.key,
      status: ticket.status as TicketStatus,
      tags: parseTagsJson(ticket.tagsJson),
      title: ticket.title,
    }));

    projects.push({
      name: project.name,
      slug: project.slug,
      tickets,
    });
  }

  return projects;
};
/* eslint-enable no-await-in-loop */

export default capsule({
  endpoints: {
    // Complete snapshot replacement for the external ingestion workload.
    putSnapshot: endpoint(
      { method: "PUT", path: "/api/v1/snapshot" },
      async (ctx, req) => {
        if (
          !isAuthorizedIngest(
            req.headers.get("authorization"),
            ctx.env.INGEST_TOKEN
          )
        ) {
          ctx.log.warn("snapshot ingest rejected", {
            category: "unauthorized",
            outcome: "unauthorized",
          });
          return json({ error: "unauthorized", ok: false }, { status: 401 });
        }

        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          ctx.log.warn("snapshot ingest rejected", {
            category: "malformed",
            outcome: "rejected",
          });
          return json({ error: "malformed_json", ok: false }, { status: 400 });
        }

        const validated = validateSnapshot(raw);
        if (!validated.ok) {
          const status = statusForValidationCategory(validated.category);

          ctx.log.warn("snapshot ingest rejected", {
            category: validated.category,
            outcome: "rejected",
          });

          return json(
            {
              error: validated.category,
              message: validated.message,
              ok: false,
            },
            { status }
          );
        }

        try {
          await replaceSnapshot(ctx.db, validated.snapshot.projects);

          ctx.log.info("snapshot ingest committed", {
            outcome: "ok",
            projects: validated.projectCount,
            tickets: validated.ticketCount,
          });

          return json({
            ok: true,
            projects: validated.projectCount,
            tickets: validated.ticketCount,
          });
        } catch (error) {
          ctx.log.error("snapshot ingest failed", {
            category: "server_error",
            message: error instanceof Error ? error.message : "unknown_error",
            outcome: "error",
          });
          return json({ error: "server_error", ok: false }, { status: 500 });
        }
      }
    ),
  },

  name: "Looper",

  queries: {
    // Ordered board snapshot for authorized viewers. Order keys stay internal.
    board: query(async (ctx): Promise<BoardSnapshot | null> => {
      const session = sessionFor(ctx);
      if (session.access !== "authorized") {
        return null;
      }

      const projects = await loadBoardProjects(ctx);
      return { projects };
    }),

    // Authorization gate for the private board. Guests and denied accounts
    // receive only session metadata — never project or ticket rows.
    session: query((ctx): SessionSnapshot => sessionFor(ctx)),
  },

  schema: {
    projects: table({
      name: string(),
      orderKey: string(),
      slug: string(),
    }).index("by_order", ["orderKey"]),

    tickets: table({
      key: string(),
      orderKey: string(),
      projectId: id("projects"),
      status: string(),
      tagsJson: string(),
      title: string(),
    }).index("by_project_order", ["projectId", "orderKey"]),
  },
});
