import { z } from "zod";
import { Incident, IncidentAnalysis, ReplayOutcome } from "../../packages/core/schemas.ts";
import { sanitizeIncident } from "../../packages/core/sanitize.ts";

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

/** Only these fields may be patched; anything else (incident, source, receivedAt, __proto__) is rejected. */
export const IncidentPatch = z
  .object({
    analysis: IncidentAnalysis.optional(),
    analysisSource: z.enum(["model", "fallback"]).optional(),
    replayOutcome: ReplayOutcome.optional(),
    issueUrl: z.string().url().optional(),
    prUrl: z.string().url().optional(),
  })
  .strict();
export type IncidentPatch = z.infer<typeof IncidentPatch>;

/** Throws ZodError on an invalid or non-whitelisted patch. */
export function updateIncident(id: string, rawPatch: unknown): StoredIncident | undefined {
  const patch = IncidentPatch.parse(rawPatch);
  const row = incidents.find((r) => r.incident.id === id);
  if (!row) return undefined;
  if (patch.analysis !== undefined) row.analysis = patch.analysis;
  if (patch.analysisSource !== undefined) row.analysisSource = patch.analysisSource;
  if (patch.replayOutcome !== undefined) row.replayOutcome = patch.replayOutcome;
  if (patch.issueUrl !== undefined) row.issueUrl = patch.issueUrl;
  if (patch.prUrl !== undefined) row.prUrl = patch.prUrl;
  return row;
}

export function removeIncident(id: string): boolean {
  const i = incidents.findIndex((r) => r.incident.id === id);
  if (i === -1) return false;
  incidents.splice(i, 1);
  return true;
}

export function clearIncidents(): number {
  const n = incidents.length;
  incidents.length = 0;
  return n;
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
