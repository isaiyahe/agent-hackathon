import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setDefaultOpenAIClient, setTracingDisabled } from '@openai/agents';
import OpenAI from 'openai';
import { analyzeIncident, createOpenAIRunner } from '../src/analyzeIncident.js';
import { sanitizeIncident } from '../src/sanitize.js';
import { IncidentInput } from '../src/schemas.js';
import { demoIncident, goodModelOutput } from './fixtures.js';

setTracingDisabled(true);

/**
 * Runs the real OpenAI client + Agents SDK against a fake Responses API, so the exact wire request
 * (model, strict JSON schema, no tools) is checked without network access or an API key.
 */
test('sends a strict json_schema Responses API request with only sanitized facts', async () => {
  const requests: { url: string; body: Record<string, any>; headers: Headers }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    const response = {
      id: 'resp_test',
      object: 'response',
      created_at: 1,
      status: 'completed',
      model: 'gpt-5.6-luna',
      output: [
        {
          type: 'message',
          id: 'msg_test',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(goodModelOutput), annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  setDefaultOpenAIClient(new OpenAI({ apiKey: 'sk-test-not-real', fetch: fakeFetch, maxRetries: 0 }));

  const raw = { ...demoIncident(), cookies: 'sid=secret-cookie', url: 'http://localhost:5173/checkout?token=abc' };
  const { incident } = sanitizeIncident(IncidentInput.parse(raw), raw);
  const result = await analyzeIncident(incident, { runner: createOpenAIRunner('gpt-5.6-luna'), model: 'gpt-5.6-luna', timeoutMs: 5_000 });

  assert.equal(result.source, 'openai');
  assert.deepEqual(result.analysis, goodModelOutput);
  assert.equal(requests.length, 1);
  const { url, body } = requests[0];
  assert.match(url, /\/responses$/);
  assert.equal(body.model, 'gpt-5.6-luna');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(Object.keys(body.text.format.schema.properties).sort(), Object.keys(goodModelOutput).sort());
  assert.ok(!body.tools?.length, 'agent has no tools');
  const sent = JSON.stringify(body);
  assert.ok(sent.includes('Add Demo Item'));
  for (const secret of ['secret-cookie', 'token=abc']) assert.ok(!sent.includes(secret), `sent ${secret}`);
});
