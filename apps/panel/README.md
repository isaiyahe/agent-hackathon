# REPRO DevTools panel (no build step)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick this folder (`apps/panel`).
2. Open http://localhost:3000/checkout, press F12, click the **REPRO** tab.
3. Use the app until it breaks. The panel fills in. Then: Analyze → Verify by replay → Create GitHub issue → Propose fix → Apply & verify → Open PR → Notify team.

Needs the REPRO server on :8787 and the demo on :3000. Change with
`localStorage.setItem("repro.server", "...")` in the panel's console if needed.
