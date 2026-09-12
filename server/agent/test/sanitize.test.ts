import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeIncident, sanitizeUrl, scrubText } from '../src/sanitize.js';
import { IncidentInput } from '../src/schemas.js';
import { demoIncident } from './fixtures.js';

function sanitize(raw: unknown) {
  return sanitizeIncident(IncidentInput.parse(raw), raw);
}

test('the demo incident passes through unchanged apart from normalization', () => {
  const { incident, redactions } = sanitize(demoIncident());
  assert.deepEqual(redactions, []);
  assert.deepEqual(incident, {
    id: 'inc-001',
    page: { url: 'http://localhost:5173/checkout', route: '/checkout', title: 'REPRO Demo Checkout' },
    actions: [
      { type: 'click', label: 'Add Demo Item', selector: "[data-testid='add-demo-item']" },
      { type: 'click', label: 'Continue as Guest', selector: "[data-testid='continue-as-guest']" },
      { type: 'click', label: 'Checkout', selector: "[data-testid='checkout']" },
    ],
    network: { method: 'POST', endpoint: '/api/checkout', status: 500, statusText: 'Internal Server Error' },
  });
});

test('drops headers, cookies, bodies, DOM, and input values', () => {
  const raw = {
    ...demoIncident(),
    html: '<html><body>whole page</body></html>',
    cookies: 'sid=abc',
    actions: [{ type: 'input', label: 'Password', value: 'hunter2', selector: '#password' }],
    network: {
      method: 'post',
      endpoint: '/api/checkout',
      status: 500,
      headers: { Authorization: 'Bearer abcdefghijklmnop', Cookie: 'session=xyz' },
      requestBody: '{"card":"4242"}',
      responseBody: '{"error":"x"}',
    },
  };
  const { incident, redactions } = sanitize(raw);
  const json = JSON.stringify(incident);
  for (const leaked of ['whole page', 'sid=abc', 'hunter2', 'abcdefghijklmnop', 'session=xyz', '4242']) {
    assert.ok(!json.includes(leaked), `leaked ${leaked}`);
  }
  assert.equal(incident.network?.method, 'POST');
  assert.deepEqual(incident.actions, [{ type: 'input', label: 'Password', selector: '#password' }]);
  for (const path of ['incident.html', 'incident.cookies', 'incident.actions[0].value', 'incident.network.headers', 'incident.network.requestBody', 'incident.network.responseBody']) {
    assert.ok(redactions.includes(`${path}: dropped (not accepted)`), `missing redaction note for ${path}`);
  }
});

test('strips sensitive query params, URL credentials, and token fragments', () => {
  assert.equal(
    sanitizeUrl('http://user:pw@localhost:5173/checkout?code=abc&token=t&session_id=s&api_key=k&step=2#access_token=zzz'),
    'http://localhost:5173/checkout?step=2',
  );
  assert.equal(sanitizeUrl('/api/checkout?password=p&cart=1'), '/api/checkout?cart=1');
  assert.equal(sanitizeUrl('data:text/html,<h1>page</h1>'), 'data:[REDACTED]');

  const { incident, redactions } = sanitize({
    ...demoIncident(),
    url: undefined,
    page: { url: 'http://localhost:5173/checkout?code=oauth-code&state=s1' },
    network: { method: 'POST', endpoint: 'http://localhost:5173/api/checkout?token=abc', status: 500 },
  });
  assert.equal(incident.page.url, 'http://localhost:5173/checkout');
  assert.equal(incident.network?.endpoint, '/api/checkout');
  assert.ok(redactions.includes('incident.page.url: removed query param "code"'));
  assert.ok(redactions.includes('incident.network.endpoint: removed query param "token"'));
});

test('masks secret-like values inside free text', () => {
  const samples = [
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'failed with token=sk-proj-abcdefghijklmnopqrstuvwxyz123456',
    'gh token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'password: hunter2',
    'Cookie=session=0123456789abcdef0123456789abcdef',
  ];
  for (const sample of samples) {
    const { text, count } = scrubText(sample);
    assert.ok(count > 0, `nothing masked in: ${sample}`);
    for (const secret of ['eyJhbGci', 'sk-proj-abc', 'ghp_abc', 'hunter2', '0123456789abcdef']) {
      assert.ok(!text.includes(secret), `leaked ${secret} in: ${text}`);
    }
  }
  const benign = "TypeError: Cannot read properties of null (reading 'id') at [data-testid='checkout-button-primary-2024-variant']";
  assert.deepEqual(scrubText(benign), { text: benign, count: 0 });
});

test('truncates stacks and long labels', () => {
  const stack = Array.from({ length: 40 }, (_, i) => `    at frame${i} (http://localhost:5173/src/app.tsx?t=${i}:1:1)`).join('\n');
  const { incident } = sanitize({
    ...demoIncident(),
    actions: [{ type: 'click', label: 'x'.repeat(400) }],
    runtimeError: { name: 'TypeError', message: "Cannot read properties of null (reading 'id')", stack },
  });
  assert.equal(incident.runtimeError?.stack?.split('\n').length, 10);
  assert.ok(incident.actions[0].label.length <= 160);
});

test('rejects incidents without a failure signal and oversized strings', () => {
  assert.equal(IncidentInput.safeParse({ ...demoIncident(), network: undefined }).success, false);
  assert.equal(IncidentInput.safeParse({ ...demoIncident(), actions: [{ type: 'click', label: 'x'.repeat(5_000) }] }).success, false);
});
