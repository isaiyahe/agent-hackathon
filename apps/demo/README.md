# Demo Shop

A deliberately broken checkout used to demonstrate [REPRO](https://github.com/isaiyahe/agent-hackathon),
a Chrome DevTools agent that witnesses a web failure, replays it to verify it, and files the issue.

**Seeded bug:** guest checkout never creates a customer record, so `POST /api/checkout`
dereferences `null` and returns 500.

```bash
npm install
npm run dev      # http://localhost:3000/checkout
```

Issues in this repo are filed by REPRO after explicit user approval.
The source of truth for this app is `apps/demo` in the REPRO monorepo; this repo is a mirror.
