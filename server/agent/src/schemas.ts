import { z } from 'zod';

/*
 * Request schemas accept the extension's plain objects (apps/extension/lib/types.ts) and the
 * `page: { url, title }` variant. Unknown keys (headers, cookies, bodies, DOM, ...) are stripped,
 * and every string and array is bounded so full-page HTML cannot ride along.
 */

const optionalText = (max: number) => z.string().max(max).optional();

export const ActionInput = z.object({
  id: optionalText(100),
  timestamp: z.number().optional(),
  type: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(500),
  selector: optionalText(500),
});

export const NetworkInput = z.object({
  method: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{1,16}$/, 'method must be an HTTP verb'),
  endpoint: z.string().trim().min(1).max(2048),
  status: z.number().int().min(0).max(599),
  statusText: optionalText(100),
  /** Optional excerpt of a JSON error response, e.g. `code: "GUEST_USER_NULL"`. Never the full body. */
  errorCode: optionalText(100),
  errorMessage: optionalText(1000),
  timestamp: z.number().optional(),
});

export const RuntimeErrorInput = z.object({
  name: optionalText(100),
  message: z.string().max(2000),
  stack: optionalText(8000),
  timestamp: z.number().optional(),
});

export const IncidentInput = z
  .object({
    id: z.string().trim().min(1).max(100),
    url: optionalText(2048),
    page: z.object({ url: optionalText(2048), title: optionalText(300) }).optional(),
    detectedAt: z.number().optional(),
    actions: z.array(ActionInput).max(100).default([]),
    network: NetworkInput.optional(),
    runtimeError: RuntimeErrorInput.optional(),
  })
  .refine((incident) => incident.network || incident.runtimeError, {
    message: 'incident must include a network failure or a runtime error',
  });
export type IncidentInput = z.infer<typeof IncidentInput>;

/** The minimal, redacted incident that the model and the issue builder see. */
export type Incident = {
  id: string;
  page: { url?: string; route?: string; title?: string };
  actions: { type: string; label: string; selector?: string }[];
  network?: {
    method: string;
    endpoint: string;
    status: number;
    statusText?: string;
    errorCode?: string;
    errorMessage?: string;
  };
  runtimeError?: { name?: string; message: string; stack?: string };
};

export const Confidence = z.enum(['high', 'medium', 'low']);

/** API response contract for an analysis. Always satisfied, whether it came from OpenAI or the fallback. */
export const IncidentAnalysis = z.object({
  title: z.string().min(1).max(120),
  observed: z.array(z.string().min(1).max(300)).min(1).max(6),
  reproductionSteps: z.array(z.string().min(1).max(200)).min(1).max(10),
  hypothesis: z.string().min(1).max(500),
  confidence: Confidence,
  evidenceGaps: z.array(z.string().min(1).max(300)).max(5),
});
export type IncidentAnalysis = z.infer<typeof IncidentAnalysis>;

/**
 * Schema sent to OpenAI as the structured-output format. No length bounds (strict JSON schema mode
 * rejects some of them); bounds are enforced afterwards by `IncidentAnalysis`. It deliberately has
 * no field for replay or verification: the model cannot report that a bug reproduced.
 */
export const ModelAnalysisOutput = z.object({
  title: z.string(),
  observed: z.array(z.string()),
  reproductionSteps: z.array(z.string()),
  hypothesis: z.string(),
  confidence: Confidence,
  evidenceGaps: z.array(z.string()),
});

/** Analysis as a client may send it back (the extension type has optional title/observed/evidenceGaps). */
export const AnalysisInput = z.object({
  title: z.string().optional(),
  observed: z.array(z.string()).optional(),
  reproductionSteps: z.array(z.string()).optional(),
  hypothesis: z.string().optional(),
  confidence: Confidence.optional(),
  evidenceGaps: z.array(z.string()).optional(),
});

export const VerificationStatus = z.enum(['reproduced', 'not_reproduced', 'diverged', 'inconclusive']);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/** Produced by deterministic replay in the extension. Accepts `status` or the extension's `outcome`. */
export const VerificationInput = z
  .object({
    status: VerificationStatus.optional(),
    outcome: VerificationStatus.optional(),
    detail: optionalText(500),
    network: NetworkInput.optional(),
    runtimeError: RuntimeErrorInput.optional(),
  })
  .refine((v) => v.status ?? v.outcome, { message: 'verification.status is required' })
  .refine((v) => !v.status || !v.outcome || v.status === v.outcome, {
    message: 'verification.status and verification.outcome disagree',
  });

export const AnalyzeRequest = z.object({ incident: IncidentInput });

export const IssueRequest = z.object({
  incident: IncidentInput,
  analysis: z.unknown().optional(),
  verification: VerificationInput,
});
