import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTracingDisabled, Usage } from '@openai/agents';
import type { Model, ModelResponse } from '@openai/agents';
import { analyzeIncident, buildModelInput, createOpenAIRunner } from '../src/analyzeIncident.js';
import type { ModelRunner } from '../src/analyzeIncident.js';
import { sanitizeIncident } from '../src/sanitize.js';
import { IncidentAnalysis, IncidentInput } from '../src/schemas.js';
import { demoIncident, goodModelOutput } from './fixtures.js';

setTracingDisabled(true);
console.warn = () => {};
console.error = () => {};

const incident = sanitizeIncident(IncidentInput.parse(demoIncident())).incident;
const config = (runner?: ModelRunner) => ({ runner, model: 'test-model', timeoutMs: 200 });

function scripted(outputs: (unknown | Error)[]): ModelRunner & { calls: number } {
  const runner = async () => {
    const next = outputs[runner.calls++];
    if (next instanceof Error) throw next;
    return next;
  };
  runner.calls = 0;
  return runner;
}

test('valid structured output is returned as-is', async () => {
  const result = await analyzeIncident(incident, config(scripted([goodModelOutput])));
  assert.equal(result.source, 'openai');
  assert.equal(result.model, 'test-model');
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.analysis, goodModelOutput);
});

test('malformed output is retried once, then succeeds', async () => {
  const runner = scripted([{ title: 'no steps' }, goodModelOutput]);
  const result = await analyzeIncident(incident, config(runner));
  assert.equal(runner.calls, 2);
  assert.equal(result.source, 'openai');
  assert.equal(result.attempts, 2);
});

test('malformed output twice falls back to deterministic facts', async () => {
  const runner = scripted([{ nonsense: true }, { ...goodModelOutput, reproductionSteps: [] }]);
  const result = await analyzeIncident(incident, config(runner));
  assert.equal(runner.calls, 2);
  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'invalid_model_output');
  assert.equal(result.model, null);
  assert.ok(IncidentAnalysis.safeParse(result.analysis).success);
  assert.deepEqual(result.analysis.reproductionSteps, [
    'Open /checkout',
    'Click "Add Demo Item"',
    'Click "Continue as Guest"',
    'Click "Checkout"',
  ]);
  assert.equal(result.analysis.confidence, 'low');
  assert.equal(result.analysis.title, 'POST /api/checkout fails with HTTP 500 after "Checkout"');
  assert.deepEqual(result.analysis.observed, [
    'POST /api/checkout returned HTTP 500 Internal Server Error',
    '3 user actions captured before the failure',
  ]);
});

test('fallback hypothesis uses a captured null-read error', async () => {
  const withError = sanitizeIncident(
    IncidentInput.parse({ ...demoIncident(), runtimeError: { name: 'TypeError', message: "Cannot read properties of null (reading 'id')" } }),
  ).incident;
  const result = await analyzeIncident(withError, config());
  assert.equal(result.fallbackReason, 'openai_not_configured');
  assert.equal(result.attempts, 0);
  assert.match(result.analysis.hypothesis, /reads 'id' from a null value/);
});

test('timeout falls back without retrying', async () => {
  let calls = 0;
  const hang: ModelRunner = (_input, signal) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  };
  const result = await analyzeIncident(incident, config(hang));
  assert.equal(calls, 1);
  assert.equal(result.fallbackReason, 'timeout');
});

test('API errors fall back without retrying', async () => {
  const runner = scripted([Object.assign(new Error('401 Incorrect API key provided'), { status: 401 })]);
  const result = await analyzeIncident(incident, config(runner));
  assert.equal(runner.calls, 1);
  assert.equal(result.fallbackReason, 'openai_error');
});

test('the model cannot report replay success: extra fields are dropped', async () => {
  const runner = scripted([{ ...goodModelOutput, reproduced: true, verification: { status: 'reproduced' } }]);
  const result = await analyzeIncident(incident, config(runner));
  assert.deepEqual(Object.keys(result.analysis).sort(), Object.keys(goodModelOutput).sort());
  assert.ok(!buildModelInput(incident).includes('verif'));
});

test('model text is bounded and scrubbed', async () => {
  const runner = scripted([
    { ...goodModelOutput, title: `Leaked ghp_abcdefghijklmnopqrstuvwxyz0123456789 ${'x'.repeat(300)}`, observed: ['', 'POST /api/checkout returned HTTP 500'] },
  ]);
  const { analysis } = await analyzeIncident(incident, config(runner));
  assert.ok(analysis.title.length <= 120);
  assert.ok(!analysis.title.includes('ghp_'));
  assert.deepEqual(analysis.observed, ['POST /api/checkout returned HTTP 500']);
});

/** Drives the real @openai/agents run() + structured-output parsing with canned model responses. */
class FakeModel implements Model {
  calls = 0;
  requests: unknown[] = [];
  constructor(private readonly texts: string[]) {}
  async getResponse(request: unknown): Promise<ModelResponse> {
    this.requests.push(request);
    const text = this.texts[Math.min(this.calls++, this.texts.length - 1)];
    return {
      usage: new Usage(),
      output: [{ type: 'message', role: 'assistant', status: 'completed', id: `msg_${this.calls}`, content: [{ type: 'output_text', text }] }],
    };
  }
  getStreamedResponse(): never {
    throw new Error('streaming is not used');
  }
}

test('Agents SDK path: structured JSON output is parsed and validated', async () => {
  const model = new FakeModel([JSON.stringify(goodModelOutput)]);
  const result = await analyzeIncident(incident, config(createOpenAIRunner(model)));
  assert.equal(result.source, 'openai');
  assert.deepEqual(result.analysis, goodModelOutput);
  const request = model.requests[0] as { outputType: unknown; tools: unknown[] };
  assert.notEqual(request.outputType, 'text', 'agent must request structured output');
  assert.deepEqual(request.tools, []);
});

test('Agents SDK path: non-JSON output twice -> retry -> fallback', async () => {
  const model = new FakeModel(['Sure! Here is my analysis: the bug reproduced.', '{"title": 42}']);
  const result = await analyzeIncident(incident, config(createOpenAIRunner(model)));
  assert.equal(model.calls, 2);
  assert.equal(result.source, 'fallback');
  assert.equal(result.fallbackReason, 'invalid_model_output');
});
