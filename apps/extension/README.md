# REPRO — DevTools extension (panel UI)

A WXT + React MV3 extension that adds a **REPRO** tab to Chrome DevTools. The panel is purely
presentational: it renders plain data objects passed in as props and never calls `chrome.*` APIs.

## Run

```bash
cd apps/extension
npm install        # also runs `wxt prepare` (generates .wxt/ types)
npm run panel      # panel in a normal tab with mock data: http://localhost:5174/?state=failure
npm run build      # production build → .output/chrome-mv3
npm run typecheck
```

**In DevTools:** `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/.output/chrome-mv3`.
Open DevTools on any tab and select **REPRO** (it may sit under the `»` overflow menu). After a rebuild,
click reload on the extension card and reopen DevTools.

## Mock states (temporary)

The yellow **MOCK** bar at the top of the panel switches between states. With the panel focused:
`1`–`6` select a state, `P` plays the whole flow (actions stream in, then the failure lands), and `D`
hides the bar. In the preview tab, `?state=watching|recording|failure|analysis|verifying|verified`
jumps straight to a state and `?runtimeError=0` drops the runtime error from the mock incident.

## Wiring real data

Replace the mock state in `entrypoints/devtools-panel/App.tsx`. `<ReproPanel />` only needs:

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

- `ActionEvent.label` is the target's name (`"Add Demo Item"`); the UI adds the verb ("Clicked …").
- `NetworkFailure.endpoint` may be a path or a full URL; the UI displays the path.
- `runtimeError` is optional everywhere. Evidence counts, cards, and the signature list adapt when it is missing.

## Layout

```text
entrypoints/devtools/          devtools_page: registers the REPRO panel
entrypoints/devtools-panel/    panel page: main.tsx, App.tsx (mock driver), panel.css
components/                    ReproPanel, Header, StatusBadge, ActivityTimeline, EvidenceCard,
                               IncidentAnalysis, VerificationState, ActionButton, DevStateBar, icons
lib/                           types.ts (data contract), format.ts, mock.ts
```
