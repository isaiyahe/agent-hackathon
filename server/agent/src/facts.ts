import { scrubText, truncate } from './sanitize.js';
import { AnalysisInput, IncidentAnalysis } from './schemas.js';
import type { Incident } from './schemas.js';

/*
 * Deterministic facts derived from a sanitized incident. Used for the fallback analysis and for the
 * parts of the GitHub issue that must not come from the model (failure signature, evidence).
 */

export function requestSignature(network: NonNullable<Incident['network']>): string {
  return `${network.method} ${network.endpoint} → ${network.status}`;
}

export function runtimeErrorText(error: NonNullable<Incident['runtimeError']>): string {
  if (!error.name || error.message.startsWith(`${error.name}:`)) return error.message;
  return `${error.name}: ${error.message}`;
}

export function describeAction(action: Incident['actions'][number]): string {
  switch (action.type) {
    case 'click':
      return `Click "${action.label}"`;
    case 'input':
    case 'change':
      return `Enter a value in "${action.label}"`;
    case 'navigation':
      return `Navigate to ${action.label}`;
    case 'submit':
      return `Submit "${action.label}"`;
    default:
      return `${action.type.charAt(0).toUpperCase()}${action.type.slice(1)} "${action.label}"`;
  }
}

function fallbackTitle(incident: Incident): string {
  const lastAction = incident.actions.at(-1);
  if (incident.network) {
    const { method, endpoint, status } = incident.network;
    const after = lastAction ? ` after "${lastAction.label}"` : '';
    return truncate(`${method} ${endpoint} fails with HTTP ${status}${after}`, 120);
  }
  return truncate(runtimeErrorText(incident.runtimeError!), 120);
}

function fallbackObserved(incident: Incident): string[] {
  const observed: string[] = [];
  const { network, runtimeError } = incident;
  if (network) {
    const statusText = network.statusText ? ` ${network.statusText}` : '';
    observed.push(`${network.method} ${network.endpoint} returned HTTP ${network.status}${statusText}`);
    const response = [network.errorCode, network.errorMessage].filter(Boolean).join(': ');
    if (response) observed.push(`Error response: ${response}`);
  }
  if (runtimeError) observed.push(`Runtime error: ${runtimeErrorText(runtimeError)}`);
  const count = incident.actions.length;
  observed.push(`${count} user action${count === 1 ? '' : 's'} captured before the failure`);
  return observed;
}

function fallbackSteps(incident: Incident): string[] {
  const steps: string[] = [];
  const actions = incident.actions.slice(-9);
  if (incident.page.route && actions[0]?.type !== 'navigation') steps.push(`Open ${incident.page.route}`);
  steps.push(...actions.map((action) => truncate(describeAction(action), 200)));
  if (steps.length === 0) steps.push(incident.page.url ? `Open ${incident.page.url}` : 'Open the affected page');
  return steps;
}

function fallbackHypothesis(incident: Incident): string {
  const { network, runtimeError } = incident;
  const messages = [runtimeError?.message, network?.errorMessage].filter(Boolean).join(' ');
  const nullRead = /Cannot read propert(?:y|ies) of (null|undefined) \(reading '([^']+)'\)/.exec(messages);
  const where = network ? `${network.method} ${network.endpoint}` : 'this flow';

  if (nullRead) {
    return `Code handling ${where} reads '${nullRead[2]}' from a ${nullRead[1]} value, so an object it expects is missing in this flow.`;
  }
  if (network && network.status >= 500) {
    return `The server handler for ${where} fails when reached through the captured action sequence. No specific root cause is proposed without AI analysis.`;
  }
  if (network && network.status >= 400) {
    return `The server rejected ${where} with HTTP ${network.status}; the request sent during this flow is likely missing or has invalid data.`;
  }
  if (runtimeError) return truncate(`The page throws ${runtimeErrorText(runtimeError)} during the captured flow.`, 500);
  return `The request ${where} failed during the captured flow.`;
}

function fallbackGaps(incident: Incident): string[] {
  const gaps = ['AI analysis unavailable: this summary was built from captured facts only'];
  if (incident.actions.length === 0) gaps.push('No user actions were captured before the failure');
  if (!incident.runtimeError?.stack) gaps.push('No stack trace captured');
  if (incident.network && !incident.network.errorCode && !incident.network.errorMessage) {
    gaps.push('Response body not captured (off by default)');
  }
  return gaps;
}

/** Deterministic analysis built only from incident facts. Always valid; never fails. */
export function buildFallbackAnalysis(incident: Incident): IncidentAnalysis {
  return IncidentAnalysis.parse({
    title: fallbackTitle(incident),
    observed: fallbackObserved(incident).map((line) => truncate(line, 300)).slice(0, 6),
    reproductionSteps: fallbackSteps(incident),
    hypothesis: truncate(fallbackHypothesis(incident), 500),
    confidence: 'low',
    evidenceGaps: fallbackGaps(incident).slice(0, 5),
  });
}

const line = (value: string, max: number) => truncate(scrubText(value).text.replace(/\s+/g, ' ').trim(), max);
const lines = (values: string[] | undefined, max: number, count: number) =>
  (values ?? []).map((value) => line(value, max)).filter(Boolean).slice(0, count);

/**
 * Validates, bounds, and scrubs an analysis from the model or a client. Missing fields are filled
 * from `fill` when given. Returns null when the result still does not satisfy `IncidentAnalysis`.
 * Keys outside the schema (e.g. a model-invented `reproduced: true`) are dropped.
 */
export function coerceAnalysis(raw: unknown, fill?: IncidentAnalysis): IncidentAnalysis | null {
  const parsed = AnalysisInput.safeParse(raw);
  if (!parsed.success) return null;
  const a = parsed.data;

  const title = line(a.title ?? '', 120);
  const observed = lines(a.observed, 300, 6);
  const reproductionSteps = lines(a.reproductionSteps, 200, 10);
  const hypothesis = line(a.hypothesis ?? '', 500);

  const result = IncidentAnalysis.safeParse({
    title: title || fill?.title,
    observed: observed.length ? observed : fill?.observed,
    reproductionSteps: reproductionSteps.length ? reproductionSteps : fill?.reproductionSteps,
    hypothesis: hypothesis || fill?.hypothesis,
    confidence: a.confidence ?? fill?.confidence,
    evidenceGaps: a.evidenceGaps ? lines(a.evidenceGaps, 300, 5) : (fill?.evidenceGaps ?? []),
  });
  return result.success ? result.data : null;
}
