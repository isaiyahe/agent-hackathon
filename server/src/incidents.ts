import { Incident } from "../../packages/core/schemas.ts";
import { sanitizeIncident } from "../../packages/core/sanitize.ts";
import type { IncidentAnalysis, ReplayOutcome } from "../../packages/core/schemas.ts";

export const MAX_STORED = 200;

export interface StoredIncident {
  incident: Incident;
  source: "sdk" | "extension";
  receivedAt: string;
  analysis?: IncidentAnalysis;
  analysisSource?: "model" | "fallback";
  replayOutcome?: ReplayOutcome;
  issueUrl?: string;
  prUrl?: string;
}

/** Newest first. In-memory ring; Supabase mirror is optional and fire-and-forget. */
export const incidents: StoredIncident[] = [];

export interface IngestOptions {
  source?: StoredIncident["source"];
  persist?: (row: StoredIncident) => Promise<void>;
  log?: (m: string) => void;
}

export function ingestIncident(input: unknown, opts: IngestOptions = {}): StoredIncident {
  const incident = sanitizeIncident(Incident.parse(input));
  const row: StoredIncident = { incident, source: opts.source ?? "sdk", receivedAt: new Date().toISOString() };
  const existing = incidents.findIndex((r) => r.incident.id === incident.id);
  if (existing !== -1) incidents.splice(existing, 1);
  incidents.unshift(row);
  if (incidents.length > MAX_STORED) incidents.length = MAX_STORED;
  const persist = opts.persist ?? supabasePersist;
  void persist(row).catch((e) => (opts.log ?? ((m) => console.warn(`[incidents] ${m}`)))(`persist failed: ${(e as Error).message}`));
  return row;
}

export function updateIncident(id: string, patch: Partial<Omit<StoredIncident, "incident" | "receivedAt">>): StoredIncident | undefined {
  const row = incidents.find((r) => r.incident.id === id);
  if (!row) return undefined;
  Object.assign(row, patch);
  return row;
}

export function listIncidents(limit = 50): StoredIncident[] {
  return incidents.slice(0, limit);
}

export function getIncident(id: string): StoredIncident | undefined {
  return incidents.find((r) => r.incident.id === id);
}

/** Supabase mirror via PostgREST. No-op unless SUPABASE_URL and SUPABASE_SECRET_KEY are set. */
export async function supabasePersist(row: StoredIncident, env = process.env, fetcher: typeof fetch = fetch): Promise<void> {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const i = row.incident;
  const r = await fetcher(`${url}/rest/v1/incidents`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: i.id,
      captured_at: i.capturedAt,
      page_url: i.page.url,
      method: i.failedRequest.method,
      endpoint: i.failedRequest.endpoint,
      status: i.failedRequest.status,
      runtime_error: i.runtimeError?.message ?? null,
      incident: i,
      analysis: row.analysis ?? null,
      analysis_source: row.analysisSource ?? null,
      replay_outcome: row.replayOutcome ?? null,
      issue_url: row.issueUrl ?? null,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
