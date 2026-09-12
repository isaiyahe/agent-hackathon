import type { FailedRequest, ReplayObservation, ReplayOutcome, RuntimeError } from "./schemas.ts";

/** Strip ids, query strings, and trailing slashes so /api/orders/123?x=1 -> /api/orders/:id */
export function normalizeEndpoint(urlOrPath: string): string {
  let path = urlOrPath;
  try {
    path = new URL(urlOrPath, "http://x").pathname;
  } catch {
    /* already a path */
  }
  return (
    path
      .replace(/\/+$/, "")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, "/:id") || "/"
  );
}

/** Lowercase, collapse whitespace, drop line/column noise. */
export function normalizeErrorMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/:\d+:\d+/g, "")
    .trim();
}

export function sameSignature(
  target: { failedRequest: FailedRequest; runtimeError?: RuntimeError },
  observed: { failedRequest: FailedRequest; runtimeError?: RuntimeError },
): boolean {
  const t = target.failedRequest;
  const o = observed.failedRequest;
  if (normalizeEndpoint(t.endpoint) !== normalizeEndpoint(o.endpoint)) return false;
  if (t.method.toUpperCase() !== o.method.toUpperCase()) return false;
  if (t.status !== o.status) return false;
  if (target.runtimeError && observed.runtimeError) {
    return (
      normalizeErrorMessage(target.runtimeError.message) ===
      normalizeErrorMessage(observed.runtimeError.message)
    );
  }
  return true;
}

/**
 * Deterministic verdict. The model never calls this; the extension does.
 */
export function verify(
  target: { failedRequest: FailedRequest; runtimeError?: RuntimeError },
  observed: ReplayObservation,
): ReplayOutcome {
  if (!observed.completed) return "inconclusive";
  if (!observed.failedRequest) return "not_reproduced";
  return sameSignature(target, {
    failedRequest: observed.failedRequest,
    runtimeError: observed.runtimeError,
  })
    ? "reproduced"
    : "diverged";
}
