# REPRO — Build Blueprint

> **One-line pitch:** Most coding agents wait for you to describe the bug. REPRO was there when it happened.

REPRO is a Chrome DevTools-native agent that watches a web failure happen, captures the interaction and browser evidence that led to it, reconstructs reproducible steps, verifies the bug by replaying the same flow, and creates a GitHub issue after explicit user approval.

The core product is **not** an autonomous debugger. The core product is a reliable:

**witness → reconstruct → verify → issue** loop.

---

## Why REPRO fits the hackathon theme

The browser is not a wrapper around the agent. It is the agent's **sensor and test bench**.

A standalone chatbox can analyze an error after a developer pastes it in. REPRO can automatically know:

- what the developer clicked before the failure,
- what route/page they were on,
- which fetch/XHR request failed,
- the HTTP method/status/endpoint,
- what runtime exception appeared,
- the order of the captured actions,
- and whether replaying the same interaction causes the same failure again.

Remove the live browser/DevTools environment and REPRO loses its central value.

---

## Golden path

1. **Observe** — keep a short rolling buffer of semantic user actions.
2. **Detect** — trigger on an allowlisted 4xx/5xx or uncaught runtime error.
3. **Correlate** — freeze the incident window and associate nearby evidence.
4. **Reconstruct** — produce concise reproduction steps plus a labeled hypothesis.
5. **Verify** — replay the controlled flow.
6. **Compare** — deterministic code checks whether the same failure signature reappears.
7. **Act** — after confirmation, user approves **Create GitHub Issue**.

### Definition of reproduced

For the hackathon demo:

- same normalized endpoint,
- same HTTP status/status class,
- same normalized runtime error when present.

The model never decides whether a bug reproduced.

---

## 3-hour MVP

### Keep

- One controlled demo app.
- One deterministic bug.
- Chrome DevTools panel named **REPRO**.
- Rolling semantic click/input/navigation buffer.
- Failed network request detection.
- Runtime error capture if time permits.
- One verified replay path.
- Structured OpenAI analysis.
- GitHub issue creation with approval.
- Basic redaction and failure states.

### Cut

- Arbitrary production sites.
- Autonomous code patching.
- PR creation/merge.
- Full HAR/session replay.
- Cross-browser support.
- Multi-agent orchestration.
- Full observability backend.

---

## Recommended demo bug

Controlled guest checkout failure:

1. Open `/checkout`.
2. Add demo item.
3. Continue as guest.
4. Click **Checkout**.
5. `POST /api/checkout` returns `500`.
6. Related error appears, e.g. `Cannot read properties of null (reading "id")`.

Seed it intentionally so the demo reproduces reliably.

---

## Development stack

| Layer | Choice | Purpose |
|---|---|---|
| Extension | **WXT + TypeScript** | MV3 DevTools extension, content scripts, background worker |
| UI | **React** | DevTools panel |
| Browser telemetry | `chrome.devtools.network`, `chrome.devtools.inspectedWindow`, injected listeners | Live browser evidence |
| Replay | Small allowlisted DOM replayer | Deterministic replay for controlled demo |
| Backend | **Node + Hono or Express** | Server-side OpenAI/GitHub secrets |
| Agent runtime | **`@openai/agents`** | Structured analysis, tools, guardrails, tracing |
| Schemas | **Zod** | Typed incident/model output validation |
| GitHub | **Octokit or REST** | Create issue after approval |
| Tests | **Vitest + one Playwright smoke test** | Verifier/sanitizer + golden browser flow |

Minimal packages:

```bash
wxt
react
react-dom
zod
@openai/agents
octokit
vitest
playwright
```

If WXT becomes a blocker, drop to plain Manifest V3 + Vite.

---

## Architecture

```text
Controlled demo web app
        |
        | semantic clicks / inputs / navigation
        v
REPRO capture layer
        |
        +---- chrome.devtools.network
        +---- injected error/unhandledrejection listener
        +---- route / page fingerprint
        |
        v
Sanitized Incident
        |
        +--------------------------+
        |                          |
        v                          v
OpenAI incident analyst      Deterministic replay engine
        |                          |
        | typed analysis            | step outcomes
        v                          v
Hypothesis + S2R              Failure signature verifier
        |                          |
        +------------+-------------+
                     |
                     v
            REPRO DevTools panel
                     |
             user clicks Create Issue
                     |
                     v
                 GitHub API
```

---

## Model responsibilities

### Model should do

- summarize observed behavior,
- generate concise reproduction steps,
- produce a bounded root-cause hypothesis,
- state confidence/evidence gaps,
- optionally format issue text.

### Model should NOT do

- decide whether reproduction succeeded,
- invent missing telemetry,
- determine action chronology,
- decide whether a locator resolved,
- decide whether GitHub creation succeeded,
- apply code changes automatically.

> The model explains verified evidence. It does not define verified evidence.

---

## Suggested structured output

```ts
const IncidentAnalysis = z.object({
  title: z.string().max(100),
  observed: z.array(z.string()).max(6),
  reproductionSteps: z.array(z.string()).min(1).max(8),
  hypothesis: z.string().max(320),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceGaps: z.array(z.string()).max(4),
  safetyWarnings: z.array(z.string()).max(3),
});
```

Retry malformed model output once, then fall back to deterministic facts.

---

## Replay outcomes

- **reproduced** — target signature observed again.
- **not_reproduced** — flow completes but target failure does not recur.
- **diverged** — different failure appears.
- **inconclusive** — replay cannot complete, e.g. locator fails.

Never fake a successful reproduction.

---

## Failure handling

| Failure | Behavior |
|---|---|
| No failure signal | Keep watching |
| No useful actions | Mark report unverified |
| Locator missing/ambiguous | Stop replay; mark inconclusive |
| Replay succeeds instead | Mark not reproduced |
| Different failure | Mark diverged |
| Invalid model output | Retry once, then deterministic summary |
| OpenAI timeout | Show captured facts immediately |
| GitHub auth/API failure | Preserve Markdown draft; Retry / Copy Markdown |
| Stale app/page fingerprint | Require fresh capture |
| Sensitive value | Replace with `[REDACTED]` |

---

## Privacy + security

Never collect/transmit:

- cookies,
- Authorization headers,
- password values,
- full DOM/page HTML,
- full browsing history.

Request/response bodies are off by default.

Redaction pipeline:

```text
DROP SECRET FIELDS
→ STRIP TOKEN-LIKE QUERY PARAMS
→ MASK SENSITIVE INPUT VALUES
→ TRUNCATE STACKS
→ SEND MINIMAL INCIDENT
```

OpenAI and GitHub credentials stay server-side.

---

## Suggested repo structure

```text
agent-hackathon/
  apps/
    demo/
    extension/
      entrypoints/
        devtools/
        background.ts
        capture.content.ts
      components/
      lib/
        capture/
        replay/

  server/
    src/
      analyze.ts
      github.ts

  packages/
    core/
      schemas.ts
      sanitize.ts
      normalize.ts
      verify.ts

  tests/
    verify.test.ts
    sanitize.test.ts
    smoke.spec.ts
```

---

## 180-minute build plan

| Time | Goal |
|---|---|
| 0:00–0:20 | Scaffold demo + DevTools panel + backend hello |
| 0:20–0:45 | Capture semantic actions |
| 0:45–1:05 | Detect seeded failure |
| 1:05–1:25 | Build deterministic incident + sanitizer |
| 1:25–1:45 | Replay + verifier |
| 1:45–2:05 | Structured OpenAI analysis |
| 2:05–2:20 | GitHub Create Issue |
| 2:20–2:35 | Failure handling + redaction |
| 2:35–2:50 | UI polish |
| 2:50–3:00 | Freeze + rehearse |

### Hard stops

- By 0:45: harden locators if needed.
- By 1:05: cut runtime errors if network signature is enough.
- By 1:25: use a manual Reset Demo button if auto-reset is blocking.
- By 1:45: replay only the exact demo actions if general replay is unstable.
- By 2:05: cut source-code lookup.
- By 2:20: use deterministic issue Markdown if AI prose is blocking.
- After 2:35: stop adding features.

---

## Demo script

**Opening:**  
> “Most coding agents wait for you to explain the bug. REPRO is already standing where it happened.”

Then:

1. Trigger the checkout bug.
2. Show captured actions + failed request + error.
3. Show generated reproduction steps + hypothesis.
4. Click **Verify**.
5. Show same signature reproduced.
6. Click **Create GitHub Issue**.
7. Open the issue.

Technical line:

> “The model never decides whether the bug reproduced. It turns verified browser evidence into a useful explanation; capture, replay, signature matching, redaction, and issue creation are deterministic.”

Close:

> **“REPRO does not ask you to describe the bug. It witnessed it.”**

---

## Judging strategy

### Core Requirements — 5/5 target

Show a complete repeatable loop:

**trigger → capture → analyze → verify → GitHub issue**

### Innovation / Theme — 5/5 target

The browser is load-bearing: action trace, network/error evidence, page context, and replay are native inputs/actions unavailable to a blank chatbox.

### Technical Execution — 5/5 target

Show typed telemetry, deterministic verification, redaction, structured model output, bounded replay, explicit approval, and at least one fallback state.

### Usefulness / Agentic Experience — 5/5 target

Instead of:

```text
see bug → inspect console → inspect network → remember steps → paste logs into AI → write issue
```

REPRO becomes:

```text
bug happens → REPRO witnesses it → verifies it → approve issue
```

---

## Positioning

Do not pitch REPRO as:

- “Sentry with AI”
- “ChatGPT in DevTools”
- “an autonomous coding agent”

Pitch it as:

> **A debugging agent that witnessed the failure and can prove it happens again.**

---

## Final build rule

> **One demo app. One deterministic bug. One verified replay. One real GitHub action.**

Everything else is a stretch feature.
