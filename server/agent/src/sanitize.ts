import type { Incident, IncidentInput } from './schemas.js';

export const REDACTED = '[REDACTED]';

/** Query/fragment parameter names that are dropped from every URL. */
const SENSITIVE_PARAM = /token|secret|passw|session|auth|cookie|api[-_]?key|signature|jwt|otp|credential/i;
const SENSITIVE_PARAM_EXACT = /^(code|key|sig|sid|pwd|pass|state|nonce)$/i;

/** Fields that must never be sent in an incident. They are stripped (never forwarded) and reported. */
const FORBIDDEN_FIELD =
  /^(headers|requestHeaders|responseHeaders|cookies?|set-cookie|authorization|password|token|secret|session|html|outerHTML|innerHTML|dom|body|requestBody|responseBody|history|value|storage|localStorage|sessionStorage)$/i;

const LIMITS = { label: 160, selector: 200, title: 200, message: 500, errorCode: 100, stackLines: 10, stackChars: 1500 };

export function isSensitiveParam(name: string): boolean {
  return SENSITIVE_PARAM.test(name) || SENSITIVE_PARAM_EXACT.test(name);
}

/** Records what was redacted (field paths and param names only, never values). */
export class Redactor {
  readonly notes: string[] = [];

  note(message: string): void {
    if (!this.notes.includes(message)) this.notes.push(message);
  }

  /** Masks secret-like substrings, sanitizes embedded URLs, collapses whitespace, and truncates. */
  text(value: string, path: string, max: number): string {
    const { text, count } = scrubText(value);
    if (count > 0) this.note(`${path}: masked ${count} secret-like value${count === 1 ? '' : 's'}`);
    return truncate(text.replace(/\s+/g, ' ').trim(), max);
  }

  url(value: string, path: string): string {
    const removed: string[] = [];
    const url = sanitizeUrl(value, removed);
    for (const item of removed) this.note(`${path}: removed ${item}`);
    return truncate(url, 2048);
  }
}

/**
 * Strips credentials, sensitive query params, and token-bearing fragments from a URL.
 * Relative URLs stay relative. Non-http(s) URLs (data:, javascript:, ...) are dropped entirely.
 */
export function sanitizeUrl(raw: string, removed: string[] = []): string {
  let url: URL;
  let relative = false;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, 'http://relative.invalid');
      relative = true;
    } catch {
      removed.push('unparseable URL');
      return REDACTED;
    }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    removed.push(`${url.protocol} URL`);
    return `${url.protocol}${REDACTED}`;
  }
  if (url.username || url.password) {
    url.username = '';
    url.password = '';
    removed.push('URL credentials');
  }
  for (const name of [...new Set(url.searchParams.keys())]) {
    if (isSensitiveParam(name)) {
      url.searchParams.delete(name);
      removed.push(`query param "${name}"`);
    }
  }
  if (url.hash && /(^#|[?&])[^=&]*(token|code|state|secret|session|auth)[^=&]*=/i.test(url.hash)) {
    url.hash = '';
    removed.push('token-bearing URL fragment');
  }

  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

const TEXT_PATTERNS: [RegExp, (match: string, ...groups: string[]) => string][] = [
  // Authorization schemes: "Bearer abc.def"
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_m, scheme) => `${scheme} ${REDACTED}`],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, () => REDACTED],
  // Well-known key prefixes: OpenAI, GitHub, Slack, AWS
  [
    /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
    () => REDACTED,
  ],
  // key=value / key: value with a sensitive key
  [
    /\b(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[_-]?key|session(?:_?id)?|cookie|authorization)(\s*[:=]\s*)(["']?)[^\s"',;&]+/gi,
    (_m, key, sep, quote) => `${key}${sep}${quote}${REDACTED}`,
  ],
  // Long opaque strings that mix letters and digits (API keys, session ids, hashes). Word-like
  // hyphenated names such as "checkout-button-2024-variant" (and UUIDs) are left alone.
  [
    /[A-Za-z0-9_-]{32,}/g,
    (m) =>
      /\d/.test(m) && /[A-Za-z]/.test(m) && m.split(/[-_]/).some((segment) => segment.length > 12) ? REDACTED : m,
  ],
];

export function scrubText(input: string): { text: string; count: number } {
  let count = 0;
  let text = input.replace(/\bhttps?:\/\/[^\s"'<>`)\]]+/g, (match) => {
    const removed: string[] = [];
    const clean = sanitizeUrl(match, removed);
    count += removed.length;
    return clean;
  });
  for (const [pattern, replace] of TEXT_PATTERNS) {
    text = text.replace(pattern, (match, ...groups: string[]) => {
      const next = replace(match, ...groups);
      if (next !== match) count++;
      return next;
    });
  }
  return { text, count };
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Reports forbidden fields present in the raw request. Zod strips them; this makes the stripping visible. */
export function findForbiddenFields(raw: unknown, path = 'incident', depth = 0, found: string[] = []): string[] {
  if (depth > 6 || raw === null || typeof raw !== 'object') return found;
  const entries = Array.isArray(raw) ? raw.map((v, i) => [`[${i}]`, v] as const) : Object.entries(raw);
  for (const [key, value] of entries) {
    const childPath = Array.isArray(raw) ? `${path}${key}` : `${path}.${key}`;
    if (!Array.isArray(raw) && FORBIDDEN_FIELD.test(key)) found.push(childPath);
    else findForbiddenFields(value, childPath, depth + 1, found);
  }
  return found;
}

/** Normalizes an endpoint to path + sanitized query ("http://host/api/x?token=1" -> "/api/x"). */
function endpointPath(value: string, redactor: Redactor, path: string): string {
  const clean = redactor.url(value, path);
  try {
    const url = new URL(clean);
    return `${url.pathname}${url.search}`;
  } catch {
    return clean;
  }
}

function routeOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith('/') ? url.split(/[?#]/)[0] : undefined;
  }
}

function truncateStack(stack: string, redactor: Redactor): string {
  const lines = stack.split('\n').slice(0, LIMITS.stackLines);
  const scrubbed = lines.map((line, i) => redactor.text(line, `incident.runtimeError.stack[${i}]`, 300));
  return truncate(scrubbed.join('\n'), LIMITS.stackChars);
}

/**
 * DROP SECRET FIELDS → STRIP TOKEN-LIKE QUERY PARAMS → MASK SECRET-LIKE VALUES → TRUNCATE → MINIMAL INCIDENT.
 * `raw` is the unparsed request value, used only to report which forbidden fields were dropped.
 */
export function sanitizeIncident(input: IncidentInput, raw?: unknown): { incident: Incident; redactions: string[] } {
  const r = new Redactor();
  for (const field of findForbiddenFields(raw)) r.note(`${field}: dropped (not accepted)`);

  const rawUrl = input.page?.url ?? input.url;
  const url = rawUrl ? r.url(rawUrl, 'incident.page.url') : undefined;

  const incident: Incident = {
    id: r.text(input.id, 'incident.id', 100),
    page: {
      url,
      route: routeOf(url),
      title: input.page?.title ? r.text(input.page.title, 'incident.page.title', LIMITS.title) : undefined,
    },
    // Keep the actions nearest the failure.
    actions: input.actions.slice(-20).map((action, i) => ({
      type: action.type.toLowerCase(),
      label: r.text(action.label, `incident.actions[${i}].label`, LIMITS.label),
      selector: action.selector ? r.text(action.selector, `incident.actions[${i}].selector`, LIMITS.selector) : undefined,
    })),
  };
  if (input.actions.length > 20) r.note(`incident.actions: kept the last 20 of ${input.actions.length}`);

  if (input.network) {
    const n = input.network;
    incident.network = {
      method: n.method.toUpperCase(),
      endpoint: endpointPath(n.endpoint, r, 'incident.network.endpoint'),
      status: n.status,
      statusText: n.statusText ? r.text(n.statusText, 'incident.network.statusText', 100) : undefined,
      errorCode: n.errorCode ? r.text(n.errorCode, 'incident.network.errorCode', LIMITS.errorCode) : undefined,
      errorMessage: n.errorMessage ? r.text(n.errorMessage, 'incident.network.errorMessage', LIMITS.message) : undefined,
    };
  }

  if (input.runtimeError) {
    const e = input.runtimeError;
    incident.runtimeError = {
      name: e.name ? r.text(e.name, 'incident.runtimeError.name', 100) : undefined,
      message: r.text(e.message, 'incident.runtimeError.message', LIMITS.message),
      stack: e.stack ? truncateStack(e.stack, r) : undefined,
    };
  }

  return { incident: JSON.parse(JSON.stringify(incident)) as Incident, redactions: r.notes };
}
