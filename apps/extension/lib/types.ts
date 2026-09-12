/**
 * UI data contracts for the REPRO panel.
 *
 * The capture / replay / analysis layers produce these plain objects and pass
 * them into <ReproPanel />. Nothing under components/ touches chrome.* APIs.
 */

export type ReproState =
  | 'watching' // listening to the inspected tab, nothing captured yet
  | 'recording' // semantic actions are arriving in the rolling buffer
  | 'failure' // failure signal detected, incident window frozen
  | 'analysis' // reproduction steps + hypothesis available
  | 'verifying' // replay in progress
  | 'verified'; // replay finished — see VerificationResult.outcome

export type ActionEvent = {
  id: string;
  /** Epoch milliseconds. */
  timestamp: number;
  type: 'click' | 'input' | 'navigation';
  /** Human-readable target, e.g. "Add Demo Item". The UI adds the verb ("Clicked …"). */
  label: string;
  /** Locator used for replay, e.g. [data-testid="checkout"]. Shown as evidence when present. */
  selector?: string;
};

export type NetworkFailure = {
  method: string;
  endpoint: string;
  /** Request URL without query string or fragment, e.g. http://localhost:3001/api/checkout */
  url?: string;
  status: number;
  statusText?: string;
  timestamp?: number;
};

export type RuntimeError = {
  /** e.g. "TypeError". When omitted, the UI parses it from a "TypeError: …" message. */
  name?: string;
  message: string;
  timestamp?: number;
};

export type PageInfo = {
  /** Without query string or fragment, e.g. http://localhost:5173/checkout */
  url: string;
  title: string;
};

export type Incident = {
  id: string;
  /** Epoch milliseconds when the failure was observed and the incident window frozen. */
  timestamp: number;
  /** Page the failure happened on. */
  page: PageInfo;
  actions: ActionEvent[];
  network?: NetworkFailure;
  runtimeError?: RuntimeError;
};

/** Model output. Mirrors a subset of the IncidentAnalysis schema in REPRO_BUILD.md. */
export type IncidentAnalysis = {
  title?: string;
  reproductionSteps: string[];
  hypothesis: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceGaps?: string[];
};

export type VerificationOutcome = 'reproduced' | 'not_reproduced' | 'diverged' | 'inconclusive';

/** Produced by the deterministic replay + signature check — never by the model. */
export type VerificationResult = {
  outcome: VerificationOutcome;
  /** Failure signature observed during replay. */
  network?: NetworkFailure;
  runtimeError?: RuntimeError;
  detail?: string;
};
