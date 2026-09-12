import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { PageSnapshot } from '../lib/capture/collector.ts';
import type { InspectedPage } from '../lib/capture/devtools.ts';
import { buildIncident, pushActions, shouldTriggerIncident, type FinishedRequest } from '../lib/capture/incident.ts';
import { startLiveCapture, type LiveCaptureState } from '../lib/capture/session.ts';
import type { ActionEvent } from '../lib/types.ts';

const CHECKOUT_URL = 'http://localhost:3001/api/checkout';
const PAGE = { url: 'http://localhost:5173/checkout', title: 'Checkout · REPRO Demo Store' };
const POST_500: FinishedRequest = { method: 'POST', url: CHECKOUT_URL, status: 500, statusText: 'Internal Server Error' };

test('shouldTriggerIncident accepts only POST /api/checkout with a 5xx', () => {
  assert.equal(shouldTriggerIncident(POST_500), true);
  assert.equal(shouldTriggerIncident({ ...POST_500, status: 503 }), true);
  assert.equal(shouldTriggerIncident({ ...POST_500, url: `${CHECKOUT_URL}?attempt=2` }), true);

  // CORS preflight for the same endpoint.
  assert.equal(shouldTriggerIncident({ method: 'OPTIONS', url: CHECKOUT_URL, status: 204 }), false);
  assert.equal(shouldTriggerIncident({ method: 'OPTIONS', url: CHECKOUT_URL, status: 500 }), false);

  assert.equal(shouldTriggerIncident({ ...POST_500, method: 'GET' }), false);
  assert.equal(shouldTriggerIncident({ ...POST_500, status: 200 }), false);
  assert.equal(shouldTriggerIncident({ ...POST_500, status: 404 }), false);
  assert.equal(shouldTriggerIncident({ ...POST_500, url: `${CHECKOUT_URL}/items` }), false);
  assert.equal(shouldTriggerIncident({ ...POST_500, url: 'http://localhost:3001/api/orders' }), false);
  assert.equal(shouldTriggerIncident({ method: 'GET', url: 'http://localhost:5173/favicon.ico', status: 404 }), false);
  assert.equal(shouldTriggerIncident({ ...POST_500, url: 'not a url' }), false);
});

test('pushActions keeps the newest 10 actions, oldest first', () => {
  const clicks = Array.from({ length: 12 }, (_, index) => click(`Button ${index + 1}`, index + 1));
  const buffer = pushActions(pushActions([], clicks.slice(0, 7)), clicks.slice(7));
  assert.deepEqual(
    buffer.map((action) => action.label),
    clicks.slice(2).map((action) => action.label),
  );
});

test('buildIncident freezes actions up to the failure and never invents a runtime error', () => {
  const actions = [click('Add Demo Item', 1_000), click('Continue as Guest', 2_000), click('Checkout', 3_000), click('Later', 9_000)];
  const incident = buildIncident({
    id: 'incident-1',
    detectedAt: 3_050,
    page: PAGE,
    actions,
    request: { ...POST_500, url: `${CHECKOUT_URL}?token=secret` },
  });

  assert.deepEqual(
    incident.actions.map((action) => action.label),
    ['Add Demo Item', 'Continue as Guest', 'Checkout'],
  );
  assert.deepEqual(incident.network, {
    method: 'POST',
    endpoint: '/api/checkout',
    url: CHECKOUT_URL,
    status: 500,
    statusText: 'Internal Server Error',
    timestamp: 3_050,
  });
  assert.equal(incident.runtimeError, undefined);
  assert.equal(incident.timestamp, 3_050);
  assert.deepEqual(incident.page, PAGE);
});

test('live capture: clicks record, OPTIONS is ignored, POST 500 freezes one incident, reload resets', async () => {
  const fake = fakePage();
  const states: LiveCaptureState[] = [];
  const latest = () => states[states.length - 1];
  const capture = startLiveCapture(fake.page, (state) => states.push(state), { pollMs: 2 });

  try {
    assert.equal(latest()?.state, 'watching');

    fake.click('Add Demo Item', 'add-demo-item');
    await until(() => latest()?.state === 'recording');
    fake.click('Continue as Guest', 'continue-as-guest');
    fake.click('Checkout', 'checkout');
    fake.finish({ method: 'OPTIONS', url: CHECKOUT_URL, status: 204 });
    await until(() => latest()?.actions.length === 3);
    await delay(20);
    assert.equal(latest()?.state, 'recording');

    fake.finish(POST_500);
    await until(() => latest()?.state === 'failure');
    const incident = latest()?.incident;
    assert.ok(incident);
    assert.deepEqual(
      incident.actions.map((action) => [action.label, action.selector]),
      [
        ['Add Demo Item', '[data-testid="add-demo-item"]'],
        ['Continue as Guest', '[data-testid="continue-as-guest"]'],
        ['Checkout', '[data-testid="checkout"]'],
      ],
    );
    assert.equal(incident.network?.endpoint, '/api/checkout');
    assert.equal(incident.runtimeError, undefined);

    // The frozen incident ignores later clicks and failures.
    fake.click('Checkout', 'checkout');
    fake.finish(POST_500);
    await delay(20);
    assert.equal(latest()?.incident, incident);

    fake.navigate();
    assert.deepEqual(latest(), { state: 'watching', actions: [], incident: undefined });
  } finally {
    capture.stop();
  }
});

test('live capture: the final drain picks up a click still queued in the page', async () => {
  const fake = fakePage();
  const states: LiveCaptureState[] = [];
  // No second poll during the test: only the drain triggered by the failure can see the clicks.
  const capture = startLiveCapture(fake.page, (state) => states.push(state), { pollMs: 60_000 });

  try {
    await delay(5);
    fake.click('Add Demo Item', 'add-demo-item');
    fake.click('Continue as Guest', 'continue-as-guest');
    fake.click('Checkout', 'checkout');
    fake.finish(POST_500);
    await until(() => states[states.length - 1]?.state === 'failure');
    assert.equal(states[states.length - 1]?.incident?.actions.length, 3);
  } finally {
    capture.stop();
  }
});

function click(label: string, timestamp: number): ActionEvent {
  return { id: label, timestamp, type: 'click', label };
}

function fakePage() {
  const queue: PageSnapshot['clicks'] = [];
  const finished = new Set<(request: FinishedRequest) => void>();
  const navigated = new Set<(url: string) => void>();
  const page: InspectedPage = {
    drain: async () => ({ clicks: queue.splice(0), page: PAGE }),
    onRequestFinished(listener) {
      finished.add(listener);
      return () => finished.delete(listener);
    },
    onNavigated(listener) {
      navigated.add(listener);
      return () => navigated.delete(listener);
    },
  };

  return {
    page,
    click(label: string, testId: string) {
      queue.push({ timestamp: Date.now(), type: 'click', label, selector: `[data-testid="${testId}"]` });
    },
    finish(request: FinishedRequest) {
      finished.forEach((listener) => listener(request));
    },
    navigate() {
      navigated.forEach((listener) => listener(PAGE.url));
    },
  };
}

async function until(condition: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await delay(1);
  }
}
