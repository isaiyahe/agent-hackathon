import { z } from "zod";

export const Action = z.object({
  t: z.number(),
  kind: z.enum(["click", "input", "navigate"]),
  locator: z.string(),
  label: z.string().max(80),
  value: z.string().max(80).optional(),
});
export type Action = z.infer<typeof Action>;

export const FailedRequest = z.object({
  method: z.string(),
  url: z.string(),
  endpoint: z.string(),
  status: z.number(),
});
export type FailedRequest = z.infer<typeof FailedRequest>;

export const RuntimeError = z.object({
  message: z.string().max(300),
  stack: z.string().max(1000).optional(),
});
export type RuntimeError = z.infer<typeof RuntimeError>;

export const Incident = z.object({
  id: z.string(),
  capturedAt: z.string(),
  page: z.object({ url: z.string(), title: z.string() }),
  actions: z.array(Action).max(20),
  failedRequest: FailedRequest,
  runtimeError: RuntimeError.optional(),
});
export type Incident = z.infer<typeof Incident>;

export const Severity = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof Severity>;

export const IncidentAnalysis = z.object({
  title: z.string().max(100),
  severity: Severity,
  impact: z.string().max(200),
  observed: z.array(z.string()).max(6),
  reproductionSteps: z.array(z.string()).min(1).max(8),
  hypothesis: z.string().max(320),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceGaps: z.array(z.string()).max(4),
  safetyWarnings: z.array(z.string()).max(3),
});
export type IncidentAnalysis = z.infer<typeof IncidentAnalysis>;

export const ReplayOutcome = z.enum([
  "reproduced",
  "not_reproduced",
  "diverged",
  "inconclusive",
]);
export type ReplayOutcome = z.infer<typeof ReplayOutcome>;

/** What the replayer observed. `null` failedRequest means the flow completed cleanly. */
export const ReplayObservation = z.object({
  completed: z.boolean(),
  failedRequest: FailedRequest.nullable(),
  runtimeError: RuntimeError.optional(),
});
export type ReplayObservation = z.infer<typeof ReplayObservation>;

export const AnalyzeResponse = z.object({
  analysis: IncidentAnalysis,
  source: z.enum(["model", "fallback"]),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;

export const IssueRequest = z.object({
  incident: Incident,
  analysis: IncidentAnalysis,
  replay: z.object({
    outcome: ReplayOutcome,
    observed: ReplayObservation.optional(),
  }),
});
export type IssueRequest = z.infer<typeof IssueRequest>;
