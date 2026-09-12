import type { AppDeps } from '../src/app.js';

/** The guest checkout incident as the extension captures it (apps/extension/lib/types.ts shape). */
export function demoIncident() {
  return {
    id: 'inc-001',
    url: 'http://localhost:5173/checkout',
    page: { url: 'http://localhost:5173/checkout', title: 'REPRO Demo Checkout' },
    detectedAt: 1_726_160_000_000,
    actions: [
      { id: 'act-1', timestamp: 1, type: 'click', label: 'Add Demo Item', selector: "[data-testid='add-demo-item']" },
      { id: 'act-2', timestamp: 2, type: 'click', label: 'Continue as Guest', selector: "[data-testid='continue-as-guest']" },
      { id: 'act-3', timestamp: 3, type: 'click', label: 'Checkout', selector: "[data-testid='checkout']" },
    ],
    network: { method: 'POST', endpoint: '/api/checkout', status: 500, statusText: 'Internal Server Error' },
  };
}

export const goodModelOutput = {
  title: 'Guest checkout crashes when user is null',
  observed: ['POST /api/checkout returned HTTP 500'],
  reproductionSteps: ['Open /checkout', 'Add the demo item', 'Continue as guest', 'Click Checkout'],
  hypothesis: 'Guest checkout attempts to access user.id before confirming that a user exists.',
  confidence: 'high',
  evidenceGaps: [],
};

export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    analyzer: { runner: undefined, model: 'test-model', timeoutMs: 1_000 },
    github: null,
    githubUnavailableReason: 'GITHUB_TOKEN is not set',
    corsOrigins: ['chrome-extension://*', 'http://localhost:5173'],
    ...overrides,
  };
}

export function postJson(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}
