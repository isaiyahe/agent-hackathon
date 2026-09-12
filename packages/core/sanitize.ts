import { Incident } from "./schemas";

export const REDACTED = "[REDACTED]";

/** Input locators/labels that must never carry a value. */
const SENSITIVE_FIELD = /pass(word|wd|code)?|secret|token|api[-_]?key|cvv|cvc|card|ssn|otp|pin\b|auth/i;

/** Query params that look like credentials. */
const SENSITIVE_PARAM = /^(token|access_token|id_token|refresh_token|api[-_]?key|apikey|key|auth|authorization|signature|sig|session|sid|code|password|secret)$/i;

/** Header names that must be dropped before anything leaves the browser. */
const SECRET_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token)$/i;

/** Values that look like bearer tokens / JWTs / long random secrets. */
const TOKEN_LIKE = /\b(bearer\s+[a-z0-9._-]{16,}|ey[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}|(sk|ghp|gho|ghu|xox[abp])[-_][a-z0-9_-]{16,})\b/gi;

const MAX_STACK = 1000;
const MAX_MESSAGE = 300;

export function isSensitiveField(locatorOrLabel: string): boolean {
  return SENSITIVE_FIELD.test(locatorOrLabel);
}

/** Strip credential-looking query params and any userinfo from a URL. Returns the input on parse failure. */
export function stripSensitiveParams(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_PARAM.test(key)) u.searchParams.set(key, REDACTED);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/** Replace token-like substrings inside free text (messages, stacks). */
export function maskTokens(text: string): string {
  return text.replace(TOKEN_LIKE, REDACTED);
}

/** For the extension: drop secret headers from a header list before building evidence. */
export function dropSecretHeaders<T extends { name: string }>(headers: T[]): T[] {
  return headers.filter((h) => !SECRET_HEADER.test(h.name));
}

/** Raw capture shape: same fields as Incident, but length caps not yet enforced. */
export type RawIncident = Omit<Incident, "runtimeError"> & {
  runtimeError?: { message: string; stack?: string };
};

/**
 * Sanitize a raw capture into a schema-valid Incident. Pure; returns a new
 * object. Validates the OUTPUT (so oversized raw stacks are truncated, not
 * rejected). Safe to call more than once.
 */
export function sanitizeIncident(incident: RawIncident): Incident {
  return Incident.parse({
    ...incident,
    page: { ...incident.page, url: stripSensitiveParams(incident.page.url) },
    actions: incident.actions.map((a) => {
      const sensitive = isSensitiveField(a.locator) || isSensitiveField(a.label);
      const value =
        a.value === undefined ? undefined : sensitive ? REDACTED : maskTokens(a.value).slice(0, 80);
      return { ...a, value, label: maskTokens(a.label).slice(0, 80) };
    }),
    failedRequest: {
      ...incident.failedRequest,
      url: stripSensitiveParams(incident.failedRequest.url),
      endpoint: incident.failedRequest.endpoint.split("?")[0],
    },
    runtimeError: incident.runtimeError && {
      message: maskTokens(incident.runtimeError.message).slice(0, MAX_MESSAGE),
      stack:
        incident.runtimeError.stack === undefined
          ? undefined
          : maskTokens(incident.runtimeError.stack).slice(0, MAX_STACK),
    },
  });
}
