import { Agent, run } from "@openai/agents";
import {
  Incident,
  IncidentAnalysis,
  type AnalyzeResponse,
} from "../../packages/core/schemas.ts";
import { sanitizeIncident } from "../../packages/core/sanitize.ts";

export const MODEL_TIMEOUT_MS = 15_000;

const INSTRUCTIONS = `You are REPRO, a debugging analyst inside Chrome DevTools.
You receive a sanitized incident: the user's recent actions in order, the failed
network request, and an optional runtime error. All of it was observed by the
browser; none of it is speculation.

Your job:
- Summarize what was observed. Do not invent telemetry that is not present.
- Write concise reproduction steps a developer can follow. Use the action
  labels in the order given. Do not reorder or add steps.
- Give ONE bounded root-cause hypothesis and rate your confidence.
- List evidence gaps: things you would need to see to be sure.
- Add safety warnings only if the incident suggests data loss, auth, or payment impact.

You never decide whether the bug reproduced. Never claim it was verified.`;

export type ModelRunner = (
  incident: Incident,
  signal: AbortSignal,
) => Promise<unknown>;

let cachedAgent: Agent<unknown, typeof IncidentAnalysis> | undefined;

/** Default runner: OpenAI via @openai/agents with a structured output type. */
export const openaiRunner: ModelRunner = async (incident, signal) => {
  cachedAgent ??= new Agent({
    name: "REPRO incident analyst",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    instructions: INSTRUCTIONS,
    outputType: IncidentAnalysis,
  });
  const result = await run(cachedAgent, JSON.stringify(incident, null, 2), {
    signal,
    maxTurns: 1,
  });
  return result.finalOutput;
};

/** Deterministic summary from incident facts. Used when the model fails twice or times out. */
export function fallbackAnalysis(incident: Incident): IncidentAnalysis {
  const { failedRequest: fr, runtimeError, actions, page } = incident;
  const observed = [
    `${fr.method} ${fr.endpoint} returned HTTP ${fr.status}`,
    `Page: ${page.title} (${page.url})`,
  ];
  if (runtimeError) observed.push(`Runtime error: ${runtimeError.message}`);
  observed.push(`${actions.length} user action(s) captured before the failure`);

  const steps = actions.slice(-8).map((a) => a.label);
  if (steps.length === 0) steps.push(`Trigger ${fr.method} ${fr.endpoint}`);

  return IncidentAnalysis.parse({
    title: `${fr.method} ${fr.endpoint} returns ${fr.status}`.slice(0, 100),
    observed: observed.slice(0, 6),
    reproductionSteps: steps,
    hypothesis:
      "Model analysis unavailable. The facts above were captured directly from the browser and are sufficient to reproduce.",
    confidence: "low",
    evidenceGaps: ["AI analysis did not complete; hypothesis not generated"],
    safetyWarnings: [],
  });
}

async function runWithTimeout(
  runner: ModelRunner,
  incident: Incident,
  timeoutMs: number,
): Promise<IncidentAnalysis> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("model timeout")), timeoutMs);
  try {
    const raw = await runner(incident, ac.signal);
    return IncidentAnalysis.parse(raw); // throws on malformed output
  } finally {
    clearTimeout(timer);
  }
}

export interface AnalyzeOptions {
  runner?: ModelRunner;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

/**
 * Validate the incident, call the model, retry once on malformed output or
 * error, then fall back to a deterministic summary. Never throws for model
 * problems; only for an invalid incident.
 */
export async function analyzeIncident(
  input: unknown,
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResponse> {
  // Defense in depth: the extension sanitizes too, but nothing unredacted leaves this server.
  const incident = sanitizeIncident(Incident.parse(input));
  const runner = opts.runner ?? openaiRunner;
  const timeoutMs = opts.timeoutMs ?? MODEL_TIMEOUT_MS;
  const log = opts.log ?? ((m) => console.warn(`[analyze] ${m}`));

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const analysis = await runWithTimeout(runner, incident, timeoutMs);
      return { analysis, source: "model" };
    } catch (err) {
      log(`attempt ${attempt} failed: ${(err as Error).message}`);
    }
  }
  return { analysis: fallbackAnalysis(incident), source: "fallback" };
}
