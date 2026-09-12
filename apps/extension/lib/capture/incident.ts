import type { ActionEvent, Incident, NetworkFailure, PageInfo } from '../types';

// Pure incident logic: no chrome.* or DOM access, so it runs under `node --test`.

/** Size of the rolling action buffer, and the most actions an incident keeps. */
export const ACTION_BUFFER_SIZE = 10;

/** The only parts of a finished request (HAR entry) REPRO reads: never headers, cookies, or bodies. */
export type FinishedRequest = {
  method: string;
  url: string;
  status: number;
  statusText?: string;
};

/**
 * The demo's incident signal: POST /api/checkout answered with a 5xx.
 * The CORS preflight (OPTIONS /api/checkout → 204) and every other request are ignored.
 */
export function shouldTriggerIncident(request: FinishedRequest): boolean {
  return request.method === 'POST' && parseUrl(request.url)?.pathname === '/api/checkout' && request.status >= 500;
}

/** Appends to the rolling buffer, keeping only the newest `limit` actions. */
export function pushActions(
  buffer: readonly ActionEvent[],
  incoming: readonly ActionEvent[],
  limit = ACTION_BUFFER_SIZE,
): ActionEvent[] {
  const next = [...buffer, ...incoming];
  return next.slice(Math.max(0, next.length - limit));
}

export type IncidentInput = {
  id: string;
  /** When the panel observed the failed request (epoch ms). */
  detectedAt: number;
  page: PageInfo;
  actions: readonly ActionEvent[];
  request: FinishedRequest;
};

/** Freezes the incident window: the actions up to the failure, plus the failed request. */
export function buildIncident({ id, detectedAt, page, actions, request }: IncidentInput): Incident {
  return {
    id,
    timestamp: detectedAt,
    page,
    actions: actions.filter((action) => action.timestamp <= detectedAt).slice(-ACTION_BUFFER_SIZE),
    network: toNetworkFailure(request, detectedAt),
    // Runtime errors are not captured yet. Never invent one.
    runtimeError: undefined,
  };
}

export function toNetworkFailure(request: FinishedRequest, timestamp: number): NetworkFailure {
  const url = parseUrl(request.url);
  return {
    method: request.method,
    endpoint: url?.pathname ?? request.url,
    // Query strings and fragments are dropped: they can carry tokens.
    url: url ? url.origin + url.pathname : undefined,
    status: request.status,
    statusText: request.statusText || undefined,
    timestamp,
  };
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}
