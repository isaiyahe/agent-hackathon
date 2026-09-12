# REPRO agent API: incident analysis + GitHub issues

Holds the server-side secrets (`OPENAI_API_KEY`, `GITHUB_TOKEN`) so the extension never sees them.
Separate from the seeded checkout harness in `server/demo` (port 3001). No database, no persistence.

## Run

```bash
cd server/agent
npm install
cp .env.example .env   # fill in OPENAI_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY
npm run dev            # http://localhost:3002
```

`npm test`, `npm run typecheck`, `npm run build` (then `node dist/index.js`). Works with no keys:
analysis falls back to deterministic facts and issue creation returns the Markdown draft.

| Env var | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | none | Missing: every analysis uses the fallback |
| `OPENAI_MODEL` | SDK default (`gpt-5.6-luna`) | |
| `OPENAI_TIMEOUT_MS` | `20000` | Per attempt |
| `GITHUB_TOKEN` | none | Fine-grained PAT, **Issues: Read and write** on the repo (classic PAT: `public_repo` / `repo`) |
| `GITHUB_REPOSITORY` | none | `owner/repo` |
| `PORT` / `HOST` | `3002` / `127.0.0.1` | Loopback only |
| `CORS_ORIGINS` | `chrome-extension://*,http://localhost:5173,http://localhost:5174` | `*` suffix = prefix match |

## Endpoints

All `POST` bodies must be `Content-Type: application/json` (else 415) and at most 64 KB (else 413).
Invalid bodies return `400 {"error","code":"INVALID_REQUEST","issues":[{path,message}]}`.

### `GET /health`

`{"status":"ok","openai":{"configured":bool,"model":string|null},"github":{"configured":bool,"repository":"owner/repo"|null,"reason"?:string}}`

### `POST /api/analyze-incident`

Request: `{ "incident": Incident }`

```ts
type Incident = {
  id: string;
  url?: string;                              // or page.url
  page?: { url?: string; title?: string };
  actions: { type: string; label: string; selector?: string; id?: string; timestamp?: number }[]; // "click" | "input" | "navigation" | ...
  network?: { method: string; endpoint: string; status: number; statusText?: string;
              errorCode?: string; errorMessage?: string };  // optional excerpt of a JSON error, never the body
  runtimeError?: { name?: string; message: string; stack?: string };
  detectedAt?: number;
};  // needs network or runtimeError. Matches apps/extension/lib/types.ts.
```

Response `200` (always, even when OpenAI fails):

```ts
{
  incidentId: string;
  analysis: {
    title: string;                 // <= 120 chars
    observed: string[];            // 1-6
    reproductionSteps: string[];   // 1-10
    hypothesis: string;            // <= 500 chars
    confidence: 'high' | 'medium' | 'low';
    evidenceGaps: string[];        // 0-5
  };
  source: 'openai' | 'fallback';
  model: string | null;
  attempts: number;                // model calls made (0 when not configured)
  fallbackReason?: 'openai_not_configured' | 'invalid_model_output' | 'timeout' | 'openai_error';
  redactions: string[];            // what was stripped, by field path; never values
}
```

One `@openai/agents` agent, no tools, structured output from a Zod schema (strict JSON schema).
The output schema has no verification field, and the request never contains verification data, so
the model cannot say whether the bug reproduced. Output is re-validated with Zod, bounded, and
scrubbed. Malformed output is retried once. After that, or on timeout or API error, the response is
a deterministic analysis built from the incident (`confidence: "low"`).

### `POST /api/github/issues`

Call it only when the user clicks **Create GitHub Issue**.

Request: `{ incident: Incident, analysis?: Analysis, verification: { status | outcome, detail?, network?, runtimeError? } }`

- `verification.status` (or the extension's `outcome`) must be `"reproduced"`, else `422 NOT_REPRODUCED`.
- `analysis` may be the API response's `analysis` or the extension's `IncidentAnalysis`. Missing
  fields are filled from the deterministic summary. If it is invalid or absent, the deterministic summary is used.

| Status | Body |
| --- | --- |
| `201` | `{ created: true, issue: { number, url }, title, markdown, redactions, warnings }` |
| `422` | `{ created: false, code: "NOT_REPRODUCED", error, title, markdown, ... }` |
| `503` | `{ created: false, code: "GITHUB_NOT_CONFIGURED", error, title, markdown, ... }` |
| `502` | `{ created: false, code: "GITHUB_API_ERROR", error, title, markdown, ... }` e.g. `GitHub API returned 401: Bad credentials` |

The Markdown draft comes back on every outcome, so the UI can offer **Retry** or **Copy Markdown**.
Concurrent requests for the same `incident.id` share one GitHub call.

### `POST /api/github/issues/draft`

Same request. Returns `200 { title, markdown, canCreate, githubConfigured, redactions, warnings }`
without calling GitHub. Use it for a preview before approval.

## Security

- The incident is parsed with bounded Zod schemas. Unknown keys are dropped, and forbidden fields
  (`headers`, `cookies`, `authorization`, `password`, `token`, `session`, `html`, `dom`, `body`,
  `requestBody`, `responseBody`, `value`, `history`, ...) are reported in `redactions`.
- URLs lose credentials, `data:`/`javascript:` content, token fragments, and sensitive query params
  (`code`, `state`, `token`, `*session*`, `*secret*`, `*auth*`, `api_key`, `password`, ...).
- Free text (labels, selectors, errors, stacks, model output) is scrubbed for Bearer/Basic values,
  JWTs, `sk-`/`ghp_`/`github_pat_`/`xox*`/`AKIA` keys, `password=...`-style pairs, and long opaque tokens.
  Stacks are cut to 10 lines.
- Issue bodies use only sanitized facts and scrubbed text. `@mentions` are neutralized.
- Logs show method, path, status, and timing, plus scrubbed error messages. Bodies and headers are never logged.
- With `OPENAI_API_KEY` set, the Agents SDK exports traces (the sanitized input and output) to the
  OpenAI dashboard. Set `OPENAI_AGENTS_DISABLE_TRACING=1` to turn that off.
