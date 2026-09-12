import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFallbackAnalysis } from '../src/facts.js';
import { buildIssueDraft, createGitHubIssue, GitHubIssueError, readGitHubConfig } from '../src/github.js';
import { sanitizeIncident } from '../src/sanitize.js';
import { IncidentInput } from '../src/schemas.js';
import type { IncidentAnalysis } from '../src/schemas.js';
import { demoIncident, goodModelOutput } from './fixtures.js';

const incident = sanitizeIncident(IncidentInput.parse(demoIncident())).incident;
const analysis = goodModelOutput as IncidentAnalysis;

test('builds the expected issue for a reproduced incident', () => {
  const draft = buildIssueDraft(incident, analysis, { status: 'reproduced' });
  assert.equal(draft.title, 'Guest checkout crashes when user is null');
  assert.equal(
    draft.markdown,
    `## Observed failure

POST /api/checkout → 500

## Verified steps to reproduce

1. Open /checkout
2. Add the demo item
3. Continue as guest
4. Click Checkout

## Verification

REPRO replayed the interaction and observed the same failure signature.

## Evidence

- 3 captured user actions
  - Click "Add Demo Item" (\`[data-testid='add-demo-item']\`)
  - Click "Continue as Guest" (\`[data-testid='continue-as-guest']\`)
  - Click "Checkout" (\`[data-testid='checkout']\`)
- POST /api/checkout
- HTTP 500

## Hypothesis

Guest checkout attempts to access user.id before confirming that a user exists.

_Confidence: high. Generated from captured evidence; the hypothesis itself is not verified._

## Environment

- Browser: Chrome (REPRO DevTools extension)
- Route: \`/checkout\`
- Page title: REPRO Demo Checkout

---
_Filed by REPRO after explicit user approval. Incident \`inc-001\`._
`,
  );
});

test('unverified drafts say so', () => {
  const draft = buildIssueDraft(incident, buildFallbackAnalysis(incident), { status: 'inconclusive' });
  assert.match(draft.markdown, /## Steps to reproduce \(not verified\)/);
  assert.match(draft.markdown, /could not complete the replay/);
  assert.doesNotMatch(draft.markdown, /Verified steps/);
});

test('secrets and mentions in analysis text never reach the issue body', () => {
  const hostile: IncidentAnalysis = {
    ...analysis,
    title: 'Crash for @octocat',
    hypothesis: 'Token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and password=hunter2 leaked\n## Injected heading',
    reproductionSteps: ['Open http://localhost:5173/checkout?token=abc&x=1'],
  };
  const draft = buildIssueDraft(incident, hostile, { status: 'reproduced' });
  for (const secret of ['ghp_abc', 'hunter2', 'token=abc']) assert.ok(!draft.markdown.includes(secret), `leaked ${secret}`);
  assert.ok(!draft.markdown.includes('\n## Injected heading'));
  assert.ok(!draft.title.includes('@octocat'));
});

test('createGitHubIssue posts title/body and returns number + URL', async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    captured = { url, init };
    return new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/o/r/issues/42' }), { status: 201 });
  }) as typeof fetch;

  const draft = buildIssueDraft(incident, analysis, { status: 'reproduced' });
  const issue = await createGitHubIssue({ token: 'test-token', owner: 'o', repo: 'r' }, draft, fakeFetch);
  assert.deepEqual(issue, { number: 42, url: 'https://github.com/o/r/issues/42' });
  assert.equal(captured?.url, 'https://api.github.com/repos/o/r/issues');
  assert.equal((captured?.init.headers as Record<string, string>).Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(String(captured?.init.body)), { title: draft.title, body: draft.markdown });
});

test('createGitHubIssue surfaces GitHub errors without the token', async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })) as unknown as typeof fetch;
  const draft = buildIssueDraft(incident, analysis, { status: 'reproduced' });
  await assert.rejects(createGitHubIssue({ token: 'secret-token', owner: 'o', repo: 'r' }, draft, fakeFetch), (err: unknown) => {
    assert.ok(err instanceof GitHubIssueError);
    assert.equal(err.message, 'GitHub API returned 401: Bad credentials');
    return true;
  });
});

test('readGitHubConfig requires a token and owner/repo', () => {
  assert.equal(readGitHubConfig({}).config, null);
  assert.equal(readGitHubConfig({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'just-repo' }).config, null);
  assert.deepEqual(readGitHubConfig({ GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'isaiyahe/agent-hackathon' }).config, {
    token: 't',
    owner: 'isaiyahe',
    repo: 'agent-hackathon',
  });
});
