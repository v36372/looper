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
  isPlainJsonObject,
  MAX_PROJECTS,
  MAX_TICKETS,
  nextOrderKey,
  orderKeyFromIndex,
  parseTagsJson,
  validateProjectName,
  validateProjectSlug,
  validateSnapshot,
  validateTicketDescription,
  validateTicketKey,
  validateTicketStatus,
  validateTicketTitle,
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
  description: string;
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

interface ProjectRow {
  id: string;
  name: string;
  orderKey: string;
  slug: string;
}

interface TicketRow {
  description?: string;
  id: string;
  key: string;
  orderKey: string;
  projectId: string;
  status: string;
  tagsJson: string;
  title: string;
}

interface BoardDb {
  projects: {
    withIndex: (
      name: string,
      range?: (query: unknown) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<ProjectRow[]>;
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
        collect: () => Promise<TicketRow[]>;
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
    update: (
      id: string,
      value: {
        name?: string;
        orderKey?: string;
        slug?: string;
      }
    ) => Promise<unknown>;
    withIndex: (
      name: string,
      range?: (query: {
        eq: (field: string, value: string) => unknown;
      }) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<ProjectRow[]>;
        first: () => Promise<ProjectRow | null>;
      };
    };
  };
  tickets: {
    delete: (id: string) => Promise<boolean>;
    insert: (value: {
      description: string;
      key: string;
      orderKey: string;
      projectId: string;
      status: string;
      tagsJson: string;
      title: string;
    }) => Promise<unknown>;
    update: (
      id: string,
      value: {
        description?: string;
        key?: string;
        orderKey?: string;
        projectId?: string;
        status?: string;
        tagsJson?: string;
        title?: string;
      }
    ) => Promise<unknown>;
    withIndex: (
      name: string,
      range?: (query: {
        eq: (field: string, value: string) => unknown;
      }) => unknown
    ) => {
      order: (direction: "asc" | "desc") => {
        collect: () => Promise<TicketRow[]>;
        first: () => Promise<TicketRow | null>;
      };
    };
  };
}

interface LogCtx {
  log: {
    error: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
  };
}

type EndpointCtx = LogCtx & {
  db: WriteDb;
  env: { INGEST_TOKEN?: string };
};

interface EndpointReq {
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
}

/* eslint-disable no-await-in-loop --
 * Snapshot replacement, board assembly, and incremental CRUD helpers must stay
 * ordered and sequential inside Lakebed's single endpoint/query transaction.
 * Parallel helpers are avoided because the anonymous build treats them as the
 * legacy collect API.
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
        description: ticket.description,
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
      description: ticket.description ?? "",
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

const findProjectBySlug = async (
  db: WriteDb,
  slug: string
): Promise<ProjectRow | null> => {
  const project = await db.projects
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .order("asc")
    .first();
  return project ?? null;
};

const findTicketInProject = async (
  db: WriteDb,
  projectId: string,
  key: string
): Promise<TicketRow | null> => {
  const tickets = await db.tickets
    .withIndex("by_project_order", (q) => q.eq("projectId", projectId))
    .order("asc")
    .collect();
  return tickets.find((ticket) => ticket.key === key) ?? null;
};

const countAllTickets = async (db: WriteDb): Promise<number> => {
  const tickets = await db.tickets
    .withIndex("by_creation")
    .order("asc")
    .collect();
  return tickets.length;
};

const countProjects = async (db: WriteDb): Promise<number> => {
  const projects = await db.projects
    .withIndex("by_order")
    .order("asc")
    .collect();
  return projects.length;
};

const unauthorizedResponse = (ctx: LogCtx, surface: string) => {
  ctx.log.warn(`${surface} rejected`, {
    category: "unauthorized",
    outcome: "unauthorized",
  });
  return json({ error: "unauthorized", ok: false }, { status: 401 });
};

const malformedJsonResponse = (ctx: LogCtx, surface: string) => {
  ctx.log.warn(`${surface} rejected`, {
    category: "malformed",
    outcome: "rejected",
  });
  return json({ error: "malformed_json", ok: false }, { status: 400 });
};

const validationResponse = (
  ctx: LogCtx,
  surface: string,
  category: "malformed" | "too_large" | "invalid",
  message: string
) => {
  ctx.log.warn(`${surface} rejected`, {
    category,
    outcome: "rejected",
  });
  return json(
    {
      error: category,
      message,
      ok: false,
    },
    { status: statusForValidationCategory(category) }
  );
};

const notFoundResponse = (ctx: LogCtx, surface: string, message: string) => {
  ctx.log.warn(`${surface} rejected`, {
    category: "not_found",
    outcome: "rejected",
  });
  return json({ error: "not_found", message, ok: false }, { status: 404 });
};

const conflictResponse = (ctx: LogCtx, surface: string, message: string) => {
  ctx.log.warn(`${surface} rejected`, {
    category: "conflict",
    outcome: "rejected",
  });
  return json({ error: "conflict", message, ok: false }, { status: 409 });
};

const serverErrorResponse = (ctx: LogCtx, surface: string, error: unknown) => {
  ctx.log.error(`${surface} failed`, {
    category: "server_error",
    message: error instanceof Error ? error.message : "unknown_error",
    outcome: "error",
  });
  return json({ error: "server_error", ok: false }, { status: 500 });
};

const requireIngestAuth = (
  ctx: EndpointCtx,
  req: EndpointReq,
  surface: string
) => {
  if (
    !isAuthorizedIngest(req.headers.get("authorization"), ctx.env.INGEST_TOKEN)
  ) {
    return unauthorizedResponse(ctx, surface);
  }
  return null;
};

const readJsonBody = async (
  ctx: EndpointCtx,
  req: EndpointReq,
  surface: string
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof json> }
> => {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: malformedJsonResponse(ctx, surface) };
  }
};

const createProject = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "project create";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Project body must be a JSON object."
    );
  }

  const slugResult = validateProjectSlug(bodyResult.value.slug);
  if (!slugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      slugResult.category,
      slugResult.message
    );
  }

  const nameResult = validateProjectName(bodyResult.value.name);
  if (!nameResult.ok) {
    return validationResponse(
      ctx,
      surface,
      nameResult.category,
      nameResult.message
    );
  }

  try {
    const existing = await findProjectBySlug(ctx.db, slugResult.value);
    if (existing) {
      return conflictResponse(
        ctx,
        surface,
        `Project slug "${slugResult.value}" already exists.`
      );
    }

    const projectCount = await countProjects(ctx.db);
    if (projectCount >= MAX_PROJECTS) {
      return validationResponse(
        ctx,
        surface,
        "too_large",
        `Board may include at most ${MAX_PROJECTS} projects.`
      );
    }

    const projectRows = await ctx.db.projects
      .withIndex("by_order")
      .order("asc")
      .collect();
    const orderKey = nextOrderKey(projectRows.map((row) => row.orderKey));

    await ctx.db.projects.insert({
      name: nameResult.value,
      orderKey,
      slug: slugResult.value,
    });

    ctx.log.info("project create committed", {
      outcome: "ok",
      slug: slugResult.value,
    });

    return json(
      {
        name: nameResult.value,
        ok: true,
        slug: slugResult.value,
      },
      { status: 201 }
    );
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};

const updateProject = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "project update";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Project body must be a JSON object."
    );
  }

  const slugResult = validateProjectSlug(bodyResult.value.slug);
  if (!slugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      slugResult.category,
      slugResult.message
    );
  }

  if (bodyResult.value.name === undefined) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Project name is required."
    );
  }

  const nameResult = validateProjectName(bodyResult.value.name);
  if (!nameResult.ok) {
    return validationResponse(
      ctx,
      surface,
      nameResult.category,
      nameResult.message
    );
  }

  try {
    const project = await findProjectBySlug(ctx.db, slugResult.value);
    if (!project) {
      return notFoundResponse(
        ctx,
        surface,
        `Project "${slugResult.value}" was not found.`
      );
    }

    await ctx.db.projects.update(project.id, { name: nameResult.value });

    ctx.log.info("project update committed", {
      outcome: "ok",
      slug: slugResult.value,
    });

    return json({
      name: nameResult.value,
      ok: true,
      slug: slugResult.value,
    });
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};

const deleteProject = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "project delete";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Project body must be a JSON object."
    );
  }

  const slugResult = validateProjectSlug(bodyResult.value.slug);
  if (!slugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      slugResult.category,
      slugResult.message
    );
  }

  try {
    const project = await findProjectBySlug(ctx.db, slugResult.value);
    if (!project) {
      return notFoundResponse(
        ctx,
        surface,
        `Project "${slugResult.value}" was not found.`
      );
    }

    const tickets = await ctx.db.tickets
      .withIndex("by_project_order", (q) => q.eq("projectId", project.id))
      .order("asc")
      .collect();

    for (const ticket of tickets) {
      await ctx.db.tickets.delete(ticket.id);
    }
    await ctx.db.projects.delete(project.id);

    ctx.log.info("project delete committed", {
      outcome: "ok",
      slug: slugResult.value,
      tickets: tickets.length,
    });

    return json({
      ok: true,
      slug: slugResult.value,
      ticketsDeleted: tickets.length,
    });
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};

const createTicket = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "ticket create";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Ticket body must be a JSON object."
    );
  }

  const projectSlugResult = validateProjectSlug(
    bodyResult.value.projectSlug,
    "Project slug"
  );
  if (!projectSlugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      projectSlugResult.category,
      projectSlugResult.message
    );
  }

  const keyResult = validateTicketKey(bodyResult.value.key);
  if (!keyResult.ok) {
    return validationResponse(
      ctx,
      surface,
      keyResult.category,
      keyResult.message
    );
  }

  const titleResult = validateTicketTitle(bodyResult.value.title);
  if (!titleResult.ok) {
    return validationResponse(
      ctx,
      surface,
      titleResult.category,
      titleResult.message
    );
  }

  const statusResult = validateTicketStatus(bodyResult.value.status);
  if (!statusResult.ok) {
    return validationResponse(
      ctx,
      surface,
      statusResult.category,
      statusResult.message
    );
  }

  const descriptionResult = validateTicketDescription(
    bodyResult.value.description
  );
  if (!descriptionResult.ok) {
    return validationResponse(
      ctx,
      surface,
      descriptionResult.category,
      descriptionResult.message
    );
  }

  // Tags are accepted only on the complete snapshot path. Incremental creates
  // always store an empty tag list so the viewer can drop tags without
  // requiring external scripts to keep sending them.
  if (
    bodyResult.value.tags !== undefined &&
    !Array.isArray(bodyResult.value.tags)
  ) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Ticket tags must be an array when provided."
    );
  }

  try {
    const project = await findProjectBySlug(ctx.db, projectSlugResult.value);
    if (!project) {
      return notFoundResponse(
        ctx,
        surface,
        `Project "${projectSlugResult.value}" was not found.`
      );
    }

    const existingTicket = await findTicketInProject(
      ctx.db,
      project.id,
      keyResult.value
    );
    if (existingTicket) {
      return conflictResponse(
        ctx,
        surface,
        `Ticket key "${keyResult.value}" already exists in project "${projectSlugResult.value}".`
      );
    }

    const ticketCount = await countAllTickets(ctx.db);
    if (ticketCount >= MAX_TICKETS) {
      return validationResponse(
        ctx,
        surface,
        "too_large",
        `Board may include at most ${MAX_TICKETS} tickets.`
      );
    }

    const projectTickets = await ctx.db.tickets
      .withIndex("by_project_order", (q) => q.eq("projectId", project.id))
      .order("asc")
      .collect();
    const orderKey = nextOrderKey(projectTickets.map((row) => row.orderKey));

    await ctx.db.tickets.insert({
      description: descriptionResult.value,
      key: keyResult.value,
      orderKey,
      projectId: project.id,
      status: statusResult.value,
      tagsJson: encodeTagsJson([]),
      title: titleResult.value,
    });

    ctx.log.info("ticket create committed", {
      key: keyResult.value,
      outcome: "ok",
      projectSlug: projectSlugResult.value,
    });

    return json(
      {
        description: descriptionResult.value,
        key: keyResult.value,
        ok: true,
        projectSlug: projectSlugResult.value,
        status: statusResult.value,
        title: titleResult.value,
      },
      { status: 201 }
    );
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};

const parseTicketUpdateFields = (
  body: Record<string, unknown>
):
  | {
      ok: true;
      description?: string;
      status?: TicketStatus;
      title?: string;
    }
  | {
      ok: false;
      category: "malformed" | "invalid";
      message: string;
    } => {
  const hasTitle = body.title !== undefined;
  const hasStatus = body.status !== undefined;
  const hasDescription = body.description !== undefined;

  if (!(hasTitle || hasStatus || hasDescription)) {
    return {
      category: "malformed",
      message:
        "Ticket update requires at least one of title, status, or description.",
      ok: false,
    };
  }

  const fields: {
    description?: string;
    status?: TicketStatus;
    title?: string;
  } = {};

  if (hasTitle) {
    const titleResult = validateTicketTitle(body.title);
    if (!titleResult.ok) {
      return titleResult;
    }
    fields.title = titleResult.value;
  }

  if (hasStatus) {
    const statusResult = validateTicketStatus(body.status);
    if (!statusResult.ok) {
      return statusResult;
    }
    fields.status = statusResult.value;
  }

  if (hasDescription) {
    const descriptionResult = validateTicketDescription(body.description, {
      required: true,
    });
    if (!descriptionResult.ok) {
      return descriptionResult;
    }
    fields.description = descriptionResult.value;
  }

  return { ok: true, ...fields };
};

const updateTicket = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "ticket update";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Ticket body must be a JSON object."
    );
  }

  const projectSlugResult = validateProjectSlug(
    bodyResult.value.projectSlug,
    "Project slug"
  );
  if (!projectSlugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      projectSlugResult.category,
      projectSlugResult.message
    );
  }

  const keyResult = validateTicketKey(bodyResult.value.key);
  if (!keyResult.ok) {
    return validationResponse(
      ctx,
      surface,
      keyResult.category,
      keyResult.message
    );
  }

  const fieldsResult = parseTicketUpdateFields(bodyResult.value);
  if (!fieldsResult.ok) {
    return validationResponse(
      ctx,
      surface,
      fieldsResult.category,
      fieldsResult.message
    );
  }

  try {
    const project = await findProjectBySlug(ctx.db, projectSlugResult.value);
    if (!project) {
      return notFoundResponse(
        ctx,
        surface,
        `Project "${projectSlugResult.value}" was not found.`
      );
    }

    const ticket = await findTicketInProject(
      ctx.db,
      project.id,
      keyResult.value
    );
    if (!ticket) {
      return notFoundResponse(
        ctx,
        surface,
        `Ticket "${keyResult.value}" was not found in project "${projectSlugResult.value}".`
      );
    }

    const patch: {
      description?: string;
      status?: string;
      title?: string;
    } = {};
    if (fieldsResult.title !== undefined) {
      patch.title = fieldsResult.title;
    }
    if (fieldsResult.status !== undefined) {
      patch.status = fieldsResult.status;
    }
    if (fieldsResult.description !== undefined) {
      patch.description = fieldsResult.description;
    }

    await ctx.db.tickets.update(ticket.id, patch);

    ctx.log.info("ticket update committed", {
      key: keyResult.value,
      outcome: "ok",
      projectSlug: projectSlugResult.value,
    });

    return json({
      description: fieldsResult.description ?? ticket.description ?? "",
      key: keyResult.value,
      ok: true,
      projectSlug: projectSlugResult.value,
      status: fieldsResult.status ?? (ticket.status as TicketStatus),
      title: fieldsResult.title ?? ticket.title,
    });
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};

const deleteTicket = async (ctx: EndpointCtx, req: EndpointReq) => {
  const surface = "ticket delete";
  const authError = requireIngestAuth(ctx, req, surface);
  if (authError) {
    return authError;
  }

  const bodyResult = await readJsonBody(ctx, req, surface);
  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  if (!isPlainJsonObject(bodyResult.value)) {
    return validationResponse(
      ctx,
      surface,
      "malformed",
      "Ticket body must be a JSON object."
    );
  }

  const projectSlugResult = validateProjectSlug(
    bodyResult.value.projectSlug,
    "Project slug"
  );
  if (!projectSlugResult.ok) {
    return validationResponse(
      ctx,
      surface,
      projectSlugResult.category,
      projectSlugResult.message
    );
  }

  const keyResult = validateTicketKey(bodyResult.value.key);
  if (!keyResult.ok) {
    return validationResponse(
      ctx,
      surface,
      keyResult.category,
      keyResult.message
    );
  }

  try {
    const project = await findProjectBySlug(ctx.db, projectSlugResult.value);
    if (!project) {
      return notFoundResponse(
        ctx,
        surface,
        `Project "${projectSlugResult.value}" was not found.`
      );
    }

    const ticket = await findTicketInProject(
      ctx.db,
      project.id,
      keyResult.value
    );
    if (!ticket) {
      return notFoundResponse(
        ctx,
        surface,
        `Ticket "${keyResult.value}" was not found in project "${projectSlugResult.value}".`
      );
    }

    await ctx.db.tickets.delete(ticket.id);

    ctx.log.info("ticket delete committed", {
      key: keyResult.value,
      outcome: "ok",
      projectSlug: projectSlugResult.value,
    });

    return json({
      key: keyResult.value,
      ok: true,
      projectSlug: projectSlugResult.value,
    });
  } catch (error) {
    return serverErrorResponse(ctx, surface, error);
  }
};
/* eslint-enable no-await-in-loop */

export default capsule({
  endpoints: {
    createProject: endpoint(
      { method: "POST", path: "/api/v1/projects" },
      createProject
    ),

    createTicket: endpoint(
      { method: "POST", path: "/api/v1/tickets" },
      createTicket
    ),

    deleteProject: endpoint(
      { method: "DELETE", path: "/api/v1/projects" },
      deleteProject
    ),

    deleteTicket: endpoint(
      { method: "DELETE", path: "/api/v1/tickets" },
      deleteTicket
    ),

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

    updateProject: endpoint(
      { method: "PATCH", path: "/api/v1/projects" },
      updateProject
    ),

    updateTicket: endpoint(
      { method: "PATCH", path: "/api/v1/tickets" },
      updateTicket
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
    })
      .index("by_order", ["orderKey"])
      .index("by_slug", ["slug"]),

    tickets: table({
      description: string().default(""),
      key: string(),
      orderKey: string(),
      projectId: id("projects"),
      status: string(),
      tagsJson: string(),
      title: string(),
    }).index("by_project_order", ["projectId", "orderKey"]),
  },
});
