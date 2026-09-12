import type { ActionEvent, Incident, IncidentAnalysis, VerificationResult } from './types';

// Mock data for the guest-checkout demo bug. Replace with real capture output.

export function createMockActions(start = Date.now() - 9_000): ActionEvent[] {
  return [
    {
      id: 'act-1',
      timestamp: start,
      type: 'click',
      label: 'Add Demo Item',
      selector: '[data-testid="add-demo-item"]',
    },
    {
      id: 'act-2',
      timestamp: start + 2_400,
      type: 'click',
      label: 'Continue as Guest',
      selector: '[data-testid="continue-as-guest"]',
    },
    {
      id: 'act-3',
      timestamp: start + 5_100,
      type: 'click',
      label: 'Checkout',
      selector: '[data-testid="checkout"]',
    },
  ];
}

export function createMockIncident(actions = createMockActions()): Incident {
  const lastAction = actions[actions.length - 1]?.timestamp ?? Date.now();
  return {
    id: 'inc-001',
    url: 'http://localhost:5173/checkout',
    detectedAt: lastAction + 260,
    actions,
    network: {
      method: 'POST',
      endpoint: '/api/checkout',
      status: 500,
      statusText: 'Internal Server Error',
      timestamp: lastAction + 240,
    },
    runtimeError: {
      name: 'TypeError',
      message: "Cannot read properties of null (reading 'id')",
      timestamp: lastAction + 260,
    },
  };
}

export const mockAnalysis: IncidentAnalysis = {
  title: 'Guest checkout fails with 500 on POST /api/checkout',
  reproductionSteps: ['Open /checkout', 'Add the demo item', 'Continue as guest', 'Click Checkout'],
  hypothesis: 'Guest checkout attempts to access user.id when user is null.',
  confidence: 'high',
};

export function createMockVerification(incident: Incident): VerificationResult {
  return {
    outcome: 'reproduced',
    network: incident.network,
    runtimeError: incident.runtimeError,
  };
}
