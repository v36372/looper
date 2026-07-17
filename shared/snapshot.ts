export const SNAPSHOT_VERSION = 1 as const;

export const MAX_PROJECTS = 10;
export const MAX_TICKETS = 500;
export const MAX_TAGS_PER_TICKET = 8;

export const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const PROJECT_SLUG_MAX = 48;
export const PROJECT_NAME_MAX = 80;
export const TICKET_KEY_MAX = 32;
export const TICKET_TITLE_MAX = 240;
export const TAG_MAX = 32;

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "in_review",
  "needs_human",
  "done",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketInput {
  key: string;
  status: TicketStatus;
  tags: string[];
  title: string;
}

export interface ProjectInput {
  name: string;
  slug: string;
  tickets: TicketInput[];
}

export interface SnapshotInput {
  projects: ProjectInput[];
  version: typeof SNAPSHOT_VERSION;
}

export interface BoardTicket {
  key: string;
  status: TicketStatus;
  tags: string[];
  title: string;
}

export interface BoardProject {
  name: string;
  slug: string;
  tickets: BoardTicket[];
}

export interface BoardSnapshot {
  projects: BoardProject[];
}

export type SnapshotValidationCategory =
  | "malformed"
  | "too_large"
  | "invalid"
  | "ok";

export type SnapshotValidationResult =
  | {
      category: "ok";
      ok: true;
      projectCount: number;
      snapshot: SnapshotInput;
      ticketCount: number;
    }
  | {
      category: Exclude<SnapshotValidationCategory, "ok">;
      message: string;
      ok: false;
    };

const STATUS_SET = new Set<string>(TICKET_STATUSES);

export const STATUS_LABELS: Record<TicketStatus, string> = {
  done: "DONE",
  in_progress: "IN PROGRESS",
  in_review: "IN REVIEW",
  needs_human: "NEEDS HUMAN",
  open: "OPEN",
};

export const statusLabel = (status: TicketStatus): string =>
  STATUS_LABELS[status];

export const orderKeyFromIndex = (index: number): string =>
  String(index).padStart(6, "0");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (
  category: Exclude<SnapshotValidationCategory, "ok">,
  message: string
): SnapshotValidationResult => ({
  category,
  message,
  ok: false,
});

export const parseTagsJson = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    return [];
  }
};

export const encodeTagsJson = (tags: readonly string[]): string =>
  JSON.stringify(tags);

const validateTags = (
  tagsRaw: unknown[],
  projectIndex: number,
  ticketIndex: number,
  ticketKey: string,
  projectSlug: string
): SnapshotValidationResult | string[] => {
  if (tagsRaw.length > MAX_TAGS_PER_TICKET) {
    return invalid(
      "invalid",
      `Ticket at project ${projectIndex}, index ${ticketIndex} has too many tags.`
    );
  }

  const seenTags = new Set<string>();
  const tags: string[] = [];

  for (const [tagIndex, tagRaw] of tagsRaw.entries()) {
    if (typeof tagRaw !== "string") {
      return invalid(
        "malformed",
        `Tag at project ${projectIndex}, ticket ${ticketIndex}, index ${tagIndex} must be a string.`
      );
    }

    const tag = tagRaw.trim();
    if (tag.length < 1 || tag.length > TAG_MAX) {
      return invalid(
        "invalid",
        `Tag at project ${projectIndex}, ticket ${ticketIndex}, index ${tagIndex} is invalid.`
      );
    }

    const tagKey = tag.toLowerCase();
    if (seenTags.has(tagKey)) {
      return invalid(
        "invalid",
        `Duplicate tag "${tag}" on ticket "${ticketKey}" in project "${projectSlug}".`
      );
    }
    seenTags.add(tagKey);
    tags.push(tag);
  }

  return tags;
};

const validateTicket = (
  ticketRaw: unknown,
  projectIndex: number,
  ticketIndex: number,
  projectSlug: string,
  ticketKeys: Set<string>
): SnapshotValidationResult | TicketInput => {
  if (!isPlainObject(ticketRaw)) {
    return invalid(
      "malformed",
      `Ticket at project ${projectIndex}, index ${ticketIndex} must be an object.`
    );
  }

  if (typeof ticketRaw.key !== "string") {
    return invalid(
      "malformed",
      `Ticket at project ${projectIndex}, index ${ticketIndex} is missing a string key.`
    );
  }

  if (typeof ticketRaw.title !== "string") {
    return invalid(
      "malformed",
      `Ticket at project ${projectIndex}, index ${ticketIndex} is missing a string title.`
    );
  }

  if (typeof ticketRaw.status !== "string") {
    return invalid(
      "malformed",
      `Ticket at project ${projectIndex}, index ${ticketIndex} is missing a string status.`
    );
  }

  if (!Array.isArray(ticketRaw.tags)) {
    return invalid(
      "malformed",
      `Ticket at project ${projectIndex}, index ${ticketIndex} is missing a tags array.`
    );
  }

  const key = ticketRaw.key.trim();
  const title = ticketRaw.title.trim();
  const { status } = ticketRaw;

  if (key.length < 1 || key.length > TICKET_KEY_MAX) {
    return invalid(
      "invalid",
      `Ticket key at project ${projectIndex}, index ${ticketIndex} is invalid.`
    );
  }

  if (ticketKeys.has(key)) {
    return invalid(
      "invalid",
      `Duplicate ticket key "${key}" in project "${projectSlug}".`
    );
  }
  ticketKeys.add(key);

  if (title.length < 1 || title.length > TICKET_TITLE_MAX) {
    return invalid(
      "invalid",
      `Ticket title at project ${projectIndex}, index ${ticketIndex} is invalid.`
    );
  }

  if (!STATUS_SET.has(status)) {
    return invalid(
      "invalid",
      `Ticket status at project ${projectIndex}, index ${ticketIndex} is invalid.`
    );
  }

  const tagsResult = validateTags(
    ticketRaw.tags,
    projectIndex,
    ticketIndex,
    key,
    projectSlug
  );
  if (!Array.isArray(tagsResult)) {
    return tagsResult;
  }

  return {
    key,
    status: status as TicketStatus,
    tags: tagsResult,
    title,
  };
};

const validateProject = (
  projectRaw: unknown,
  projectIndex: number,
  projectSlugs: Set<string>,
  runningTicketCount: number
):
  | SnapshotValidationResult
  | { project: ProjectInput; ticketCount: number } => {
  if (!isPlainObject(projectRaw)) {
    return invalid(
      "malformed",
      `Project at index ${projectIndex} must be an object.`
    );
  }

  if (typeof projectRaw.slug !== "string") {
    return invalid(
      "malformed",
      `Project at index ${projectIndex} is missing a string slug.`
    );
  }

  if (typeof projectRaw.name !== "string") {
    return invalid(
      "malformed",
      `Project at index ${projectIndex} is missing a string name.`
    );
  }

  if (!Array.isArray(projectRaw.tickets)) {
    return invalid(
      "malformed",
      `Project at index ${projectIndex} is missing a tickets array.`
    );
  }

  const slug = projectRaw.slug.trim();
  const name = projectRaw.name.trim();

  if (
    slug.length < 1 ||
    slug.length > PROJECT_SLUG_MAX ||
    !PROJECT_SLUG_PATTERN.test(slug)
  ) {
    return invalid(
      "invalid",
      `Project slug at index ${projectIndex} is invalid.`
    );
  }

  if (projectSlugs.has(slug)) {
    return invalid("invalid", `Duplicate project slug "${slug}".`);
  }
  projectSlugs.add(slug);

  if (name.length < 1 || name.length > PROJECT_NAME_MAX) {
    return invalid(
      "invalid",
      `Project name at index ${projectIndex} is invalid.`
    );
  }

  const nextTicketCount = runningTicketCount + projectRaw.tickets.length;
  if (nextTicketCount > MAX_TICKETS) {
    return invalid(
      "too_large",
      `Snapshot may include at most ${MAX_TICKETS} tickets.`
    );
  }

  const ticketKeys = new Set<string>();
  const tickets: TicketInput[] = [];

  for (const [ticketIndex, ticketRaw] of projectRaw.tickets.entries()) {
    const ticketResult = validateTicket(
      ticketRaw,
      projectIndex,
      ticketIndex,
      slug,
      ticketKeys
    );
    if ("ok" in ticketResult) {
      return ticketResult;
    }
    tickets.push(ticketResult);
  }

  return {
    project: {
      name,
      slug,
      tickets,
    },
    ticketCount: nextTicketCount,
  };
};

export const validateSnapshot = (raw: unknown): SnapshotValidationResult => {
  if (!isPlainObject(raw)) {
    return invalid("malformed", "Snapshot body must be a JSON object.");
  }

  if (raw.version !== SNAPSHOT_VERSION) {
    return invalid("malformed", "Snapshot version must be 1.");
  }

  if (!Array.isArray(raw.projects)) {
    return invalid("malformed", "Snapshot projects must be an array.");
  }

  if (raw.projects.length > MAX_PROJECTS) {
    return invalid(
      "too_large",
      `Snapshot may include at most ${MAX_PROJECTS} projects.`
    );
  }

  let ticketCount = 0;
  const projectSlugs = new Set<string>();
  const projects: ProjectInput[] = [];

  for (const [projectIndex, projectRaw] of raw.projects.entries()) {
    const projectResult = validateProject(
      projectRaw,
      projectIndex,
      projectSlugs,
      ticketCount
    );

    if ("ok" in projectResult) {
      return projectResult;
    }

    const { project, ticketCount: nextTicketCount } = projectResult;
    projects.push(project);
    ticketCount = nextTicketCount;
  }

  return {
    category: "ok",
    ok: true,
    projectCount: projects.length,
    snapshot: {
      projects,
      version: SNAPSHOT_VERSION,
    },
    ticketCount,
  };
};
