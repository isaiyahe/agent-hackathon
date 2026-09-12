import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { demoIncident, goodModelOutput, postJson, testDeps } from './fixtures.js';

console.log = () => {};
console.warn = () => {};
console.error = () => {};

const reproduced = { status: 'reproduced' };

test('GET /health reports configuration without secrets', async () => {
  const app = createApp(testDeps({ github: { token: 'secret-token', owner: 'o', repo: 'r' } }));
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes('secret-token'));
  assert.deepEqual(JSON.parse(text), {
    status: 'ok',
    openai: { configured: false, model: null },
    github: { configured: true, repository: 'o/r' },
  });
});

test('POST /api/analyze-incident returns structured analysis from the model', async () => {
  const app = createApp(testDeps({ analyzer: { runner: async () => goodModelOutput, model: 'gpt-test', timeoutMs: 1_000 } }));
  const res = await app.request('/api/analyze-incident', postJson({ incident: demoIncident() }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    incidentId: 'inc-001',
    analysis: goodModelOutput,
    source: 'openai',
    model: 'gpt-test',
    attempts: 1,
    redactions: [],
  });
});

test('POST /api/analyze-incident falls back when OpenAI is not configured', async () => {
  const res = await createApp(testDeps()).request('/api/analyze-incident', postJson({ incident: demoIncident() }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'fallback');
  assert.equal(body.fallbackReason, 'openai_not_configured');
  assert.equal(body.analysis.reproductionSteps.length, 4);
});

test('POST /api/analyze-incident never forwards secrets to the model', async () => {
  let modelInput = '';
  const app = createApp(
    testDeps({
      analyzer: {
        runner: async (input) => {
          modelInput = input;
          return goodModelOutput;
        },
        model: 'gpt-test',
        timeoutMs: 1_000,
      },
    }),
  );
  const incident = {
    ...demoIncident(),
    url: 'http://localhost:5173/checkout?code=oauth123&session=abc',
    page: undefined,
    cookies: 'sid=very-secret',
    network: { method: 'POST', endpoint: '/api/checkout', status: 500, headers: { Authorization: 'Bearer abcdefghijkl' } },
    runtimeError: { message: 'failed with password=hunter2' },
  };
  const res = await app.request('/api/analyze-incident', postJson({ incident }));
  assert.equal(res.status, 200);
  for (const secret of ['oauth123', 'session=abc', 'very-secret', 'abcdefghijkl', 'hunter2']) {
    assert.ok(!modelInput.includes(secret), `model saw ${secret}`);
  }
  const { redactions } = await res.json();
  assert.ok(redactions.includes('incident.cookies: dropped (not accepted)'));
  assert.ok(redactions.includes('incident.network.headers: dropped (not accepted)'));
});

test('analyze rejects invalid, non-JSON, and oversized requests', async () => {
  const app = createApp(testDeps());
  assert.equal((await app.request('/api/analyze-incident', postJson({ incident: { id: 'x' } }))).status, 400);
  assert.equal((await app.request('/api/analyze-incident', { method: 'POST', body: 'incident=1', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const huge = { incident: { ...demoIncident(), html: 'x'.repeat(70_000) } };
  assert.equal((await app.request('/api/analyze-incident', postJson(huge))).status, 413);
});

test('POST /api/github/issues refuses anything but a reproduced verification, keeping the draft', async () => {
  let fetchCalls = 0;
  const app = createApp(
    testDeps({
      github: { token: 't', owner: 'o', repo: 'r' },
      fetch: (async () => {
        fetchCalls++;
        return new Response('{}', { status: 201 });
      }) as unknown as typeof fetch,
    }),
  );
  for (const verification of [{ status: 'not_reproduced' }, { outcome: 'diverged' }, { status: 'inconclusive' }]) {
    // Analysis text claiming reproduction does not matter: only verification.status gates creation.
    const analysis = { ...goodModelOutput, hypothesis: 'The bug reproduced and is verified.' };
    const res = await app.request('/api/github/issues', postJson({ incident: demoIncident(), analysis, verification }));
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.created, false);
    assert.equal(body.code, 'NOT_REPRODUCED');
    assert.match(body.markdown, /Steps to reproduce \(not verified\)/);
  }
  assert.equal((await app.request('/api/github/issues', postJson({ incident: demoIncident(), verification: {} }))).status, 400);
  assert.equal(fetchCalls, 0);
});

test('POST /api/github/issues creates the issue and returns number + URL', async () => {
  let sentBody = '';
  const app = createApp(
    testDeps({
      github: { token: 't', owner: 'o', repo: 'r' },
      fetch: (async (_url: string, init: RequestInit) => {
        sentBody = String(init.body);
        return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 });
      }) as typeof fetch,
    }),
  );
  const res = await app.request('/api/github/issues', postJson({ incident: demoIncident(), analysis: goodModelOutput, verification: reproduced }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.created, true);
  assert.deepEqual(body.issue, { number: 7, url: 'https://github.com/o/r/issues/7' });
  assert.equal(body.title, 'Guest checkout crashes when user is null');
  assert.deepEqual(JSON.parse(sentBody), { title: body.title, body: body.markdown });
});

test('the extension IncidentAnalysis shape (no observed) and a missing analysis both work', async () => {
  const app = createApp(
    testDeps({
      github: { token: 't', owner: 'o', repo: 'r' },
      fetch: (async () => new Response(JSON.stringify({ number: 1, html_url: 'https://github.com/o/r/issues/1' }), { status: 201 })) as unknown as typeof fetch,
    }),
  );
  const extensionAnalysis = { reproductionSteps: ['Open /checkout', 'Click Checkout'], hypothesis: 'user is null', confidence: 'medium' };
  const withAnalysis = await app.request('/api/github/issues', postJson({ incident: demoIncident(), analysis: extensionAnalysis, verification: { outcome: 'reproduced' } }));
  assert.equal(withAnalysis.status, 201);
  assert.match((await withAnalysis.json()).markdown, /1\. Open \/checkout\n2\. Click Checkout/);

  const noAnalysis = await app.request('/api/github/issues', postJson({ incident: { ...demoIncident(), id: 'inc-002' }, verification: reproduced }));
  assert.equal(noAnalysis.status, 201);
  assert.equal((await noAnalysis.json()).title, 'POST /api/checkout fails with HTTP 500 after "Checkout"');
});

test('GitHub failures return the Markdown draft', async () => {
  const failing = createApp(
    testDeps({
      github: { token: 'secret-token', owner: 'o', repo: 'r' },
      fetch: (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as unknown as typeof fetch,
    }),
  );
  const res = await failing.request('/api/github/issues', postJson({ incident: demoIncident(), analysis: goodModelOutput, verification: reproduced }));
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.ok(!text.includes('secret-token'));
  const body = JSON.parse(text);
  assert.equal(body.created, false);
  assert.equal(body.code, 'GITHUB_API_ERROR');
  assert.equal(body.error, 'GitHub API returned 401: Bad credentials');
  assert.match(body.markdown, /## Verified steps to reproduce/);

  const unconfigured = await createApp(testDeps()).request('/api/github/issues', postJson({ incident: demoIncident(), verification: reproduced }));
  assert.equal(unconfigured.status, 503);
  const unconfiguredBody = await unconfigured.json();
  assert.equal(unconfiguredBody.code, 'GITHUB_NOT_CONFIGURED');
  assert.match(unconfiguredBody.markdown, /POST \/api\/checkout → 500/);
});

test('concurrent create requests for one incident file a single issue', async () => {
  let fetchCalls = 0;
  const app = createApp(
    testDeps({
      github: { token: 't', owner: 'o', repo: 'r' },
      fetch: (async () => {
        fetchCalls++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ number: 9, html_url: 'https://github.com/o/r/issues/9' }), { status: 201 });
      }) as unknown as typeof fetch,
    }),
  );
  const request = () => app.request('/api/github/issues', postJson({ incident: demoIncident(), verification: reproduced }));
  const [a, b] = await Promise.all([request(), request()]);
  assert.equal(fetchCalls, 1);
  assert.deepEqual((await a.json()).issue, (await b.json()).issue);
});

test('POST /api/github/issues/draft previews without calling GitHub', async () => {
  const res = await createApp(testDeps()).request('/api/github/issues/draft', postJson({ incident: demoIncident(), analysis: goodModelOutput, verification: reproduced }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.canCreate, false);
  assert.equal(body.githubConfigured, false);
  assert.match(body.markdown, /## Hypothesis/);
});

test('CORS allows the extension and blocks other origins', async () => {
  const app = createApp(testDeps());
  const preflight = (origin: string) =>
    app.request('/api/analyze-incident', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
  assert.equal((await preflight('chrome-extension://abcdefghijklmnop')).headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');
  assert.equal((await preflight('https://evil.example')).headers.get('access-control-allow-origin'), null);
});
