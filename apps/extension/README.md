# REPRO — DevTools extension

A WXT + React MV3 extension that adds a **REPRO** tab to Chrome DevTools. The panel watches the inspected tab
through `chrome.devtools` APIs. Everything under `components/` stays presentational: plain data in as props,
no `chrome.*` calls.

## Run

```bash
cd apps/extension
npm install        # also runs `wxt prepare` (generates .wxt/ types)
npm run build      # production build → .output/chrome-mv3
npm run typecheck
npm test           # capture logic: trigger filter, rolling buffer, incident freeze (node --test, Node 22.18+)
npm run panel      # mock preview in a normal tab: http://localhost:5174/?mock=1&state=failure
```

**In DevTools:** `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/.output/chrome-mv3`.
Open DevTools on the demo tab and select **REPRO** (it may sit under the `»` overflow menu). After a rebuild,
click reload on the extension card and reopen DevTools.

## Live capture

Capture starts when the REPRO panel is first shown and lives in the panel page for that DevTools session. It
needs no content script, background worker, or host permission.

1. **Clicks.** The panel installs a capture-phase click listener in the page with
   `chrome.devtools.inspectedWindow.eval` (`lib/capture/collector.ts`) and drains its queue every 250 ms. Each
   click on a button, link, or `[role="button"]` records the visible label and a selector (`[data-testid="…"]`,
   else `#id`). The panel keeps a rolling buffer of the last 10.
2. **Failure.** `chrome.devtools.network.onRequestFinished` reads only the method, URL, and status of each
   request. An incident is created only when `method === 'POST'`, the pathname is exactly `/api/checkout`, and
   `status >= 500` (`shouldTriggerIncident` in `lib/capture/incident.ts`). The CORS preflight
   (`OPTIONS /api/checkout → 204`) and every other request are ignored.
3. **Incident.** A final drain picks up the Checkout click still queued in the page. The actions up to that
   moment, the page URL/title, and the failed request are then frozen, and the panel switches to **Failure
   detected**. Later clicks and failures leave the frozen incident alone until **Clear**.
4. **Reload/navigation** (`network.onNavigated`) clears the buffer and incident, returns to **Watching**, and
   the next poll reinstalls the listener.

Never collected: request/response bodies, headers, cookies, input values, or page HTML. URLs are stored without
query strings or fragments. Nothing is sent anywhere. Runtime errors are not captured yet, so
`runtimeError` stays `undefined`.

## Mock states (`?mock=1`, preview only)

`?mock=1` swaps in the mock driver (`entrypoints/devtools-panel/MockApp.tsx`), which previews the analysis and
verification states that are not wired to real data yet. It never runs in DevTools, because the panel URL has
no query string. In the preview, the yellow **MOCK** bar switches states: `1`–`6` select a state, `P` plays the
whole flow, and `D` hides the bar. `?state=watching|recording|failure|analysis|verifying|verified` jumps
straight to a state, and `?runtimeError=0` drops the runtime error from the mock incident.

## Panel data contract

`entrypoints/devtools-panel/LiveApp.tsx` wires watching → recording → failure from live capture. The analysis
and verification props are still unwired. `<ReproPanel />` only needs:

| Prop | Type | Used in |
|---|---|---|
| `state` | `ReproState` | always |
| `incidentCount` | `number` | header |
| `actions` | `ActionEvent[]` | watching / recording (rolling buffer) |
| `incident` | `Incident` | failure onward |
| `analysis` | `IncidentAnalysis` | analysis onward |
| `verification` | `VerificationResult` | verified: **Create GitHub Issue** unlocks only when `outcome === 'reproduced'` |
| `analyzing`, `creatingIssue`, `notice` | `boolean` / `ReactNode` | optional loading flags and status line |
| `onAnalyze`, `onVerify`, `onCreateIssue`, `onClear` | `() => void` | optional callbacks |

Types live in `lib/types.ts`:

- `Incident` is `{ id, timestamp, page: { url, title }, actions, network?, runtimeError? }`.
- `ActionEvent.label` is the target's name (`"Add Demo Item"`). The UI adds the verb ("Clicked …").
- `NetworkFailure.endpoint` is the path (`/api/checkout`); `url` is the full request URL without the query.
- `runtimeError` is optional everywhere. Evidence counts, cards, and the signature list adapt when it is missing.

## Layout

```text
entrypoints/devtools/          devtools_page: registers the REPRO panel
entrypoints/devtools-panel/    panel page: App.tsx (live or ?mock=1), LiveApp.tsx, MockApp.tsx, panel.css
components/                    ReproPanel, Header, StatusBadge, ActivityTimeline, EvidenceCard,
                               IncidentAnalysis, VerificationState, ActionButton, DevStateBar, icons
lib/                           types.ts (data contract), format.ts, mock.ts
lib/capture/                   collector.ts (runs in the page), devtools.ts (chrome.devtools bridge),
                               incident.ts (pure trigger/buffer/incident), session.ts (live state machine)
test/                          capture.test.ts
```
