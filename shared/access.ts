export type AccessState = "guest" | "denied" | "authorized";

export interface SessionSnapshot {
  access: AccessState;
  displayName: string | null;
  email: string | null;
}

export interface AuthLike {
  email?: string;
  emailVerified?: boolean;
  isGuest: boolean;
}

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const parseAllowedEmails = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }

  const seen = new Set<string>();
  const emails: string[] = [];

  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (!email || seen.has(email)) {
      continue;
    }
    seen.add(email);
    emails.push(email);
  }

  return emails;
};

export const isEmailAllowlisted = (
  email: string | undefined,
  allowedEmails: readonly string[]
): boolean => {
  if (!email) {
    return false;
  }

  const normalized = normalizeEmail(email);
  return allowedEmails.includes(normalized);
};

export const resolveAccess = (
  auth: AuthLike,
  allowedEmails: readonly string[]
): AccessState => {
  if (auth.isGuest) {
    return "guest";
  }

  if (auth.emailVerified !== true) {
    return "denied";
  }

  if (!isEmailAllowlisted(auth.email, allowedEmails)) {
    return "denied";
  }

  return "authorized";
};
