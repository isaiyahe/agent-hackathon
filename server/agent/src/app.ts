import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { z } from 'zod';
import { analyzeIncident, errorMessage } from './analyzeIncident.js';
import type { AnalyzerConfig } from './analyzeIncident.js';
import { buildFallbackAnalysis, coerceAnalysis } from './facts.js';
import { buildIssueDraft, createGitHubIssue } from './github.js';
import type { CreatedIssue, GitHubConfig, Verification } from './github.js';
import { sanitizeIncident } from './sanitize.js';
import { AnalyzeRequest, IssueRequest } from './schemas.js';

export type AppDeps = {
  analyzer: AnalyzerConfig;
  github: GitHubConfig | null;
  githubUnavailableReason?: string;
  /** Exact origins, or prefixes ending in "*" such as "chrome-extension://*". */
  corsOrigins: string[];
  fetch?: typeof fetch;
};

export function originAllowed(origin: string, allowed: string[]): boolean {
  return allowed.some((entry) => (entry.endsWith('*') ? origin.startsWith(entry.slice(0, -1)) : origin === entry));
}

function invalid(c: Context, error: z.ZodError) {
  const issues = error.issues.slice(0, 10).map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  return c.json({ error: 'Invalid request', code: 'INVALID_REQUEST', issues }, 400);
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  /** In-flight creations keyed by incident id, so a double click cannot file two issues. */
  const inFlight = new Map<string, Promise<CreatedIssue>>();

  // Logs method, path, status, and timing only: never headers, bodies, or query strings.
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${Math.round(performance.now() - started)}ms)`);
  });

  app.use(
    cors({
      origin: (origin) => (originAllowed(origin, deps.corsOrigins) ? origin : null),
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type'],
    }),
  );

  // JSON only: blocks cross-site "simple" form/text POSTs, which would skip the CORS preflight.
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'POST' && !c.req.header('content-type')?.toLowerCase().startsWith('application/json')) {
      return c.json({ error: 'Content-Type must be application/json', code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
    }
    await next();
  });
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: 'Request body exceeds 64 KB', code: 'PAYLOAD_TOO_LARGE' }, 413),
    }),
  );

  app.onError((err, c) => {
    console.error(`[repro-agent] unhandled error: ${errorMessage(err)}`);
    return c.json({ error: 'Internal error', code: 'INTERNAL_ERROR' }, 500);
  });

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      openai: { configured: Boolean(deps.analyzer.runner), model: deps.analyzer.runner ? deps.analyzer.model : null },
      github: {
        configured: Boolean(deps.github),
        repository: deps.github ? `${deps.github.owner}/${deps.github.repo}` : null,
        reason: deps.github ? undefined : deps.githubUnavailableReason,
      },
    }),
  );

  app.post('/api/analyze-incident', async (c) => {
    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = AnalyzeRequest.safeParse(raw);
    if (!parsed.success) return invalid(c, parsed.error);

    const { incident, redactions } = sanitizeIncident(parsed.data.incident, (raw as { incident?: unknown }).incident);
    const result = await analyzeIncident(incident, deps.analyzer);
    return c.json({ incidentId: incident.id, ...result, redactions });
  });

  /** Parses an issue request into the sanitized incident, a valid analysis, and the replay verdict. */
  async function prepareIssue(c: Context) {
    const raw: unknown = await c.req.json().catch(() => undefined);
    const parsed = IssueRequest.safeParse(raw);
    if (!parsed.success) return { response: invalid(c, parsed.error) } as const;

    const { incident, redactions } = sanitizeIncident(parsed.data.incident, (raw as { incident?: unknown }).incident);
    const fallback = buildFallbackAnalysis(incident);
    const warnings: string[] = [];
    let analysis = parsed.data.analysis === undefined ? null : coerceAnalysis(parsed.data.analysis, fallback);
    if (!analysis) {
      if (parsed.data.analysis !== undefined) warnings.push('analysis was invalid; used the deterministic summary');
      analysis = fallback;
    }

    // Replay evidence is sanitized like the incident itself.
    const v = parsed.data.verification;
    const replay = sanitizeIncident({ id: incident.id, actions: [], network: v.network, runtimeError: v.runtimeError });
    const verification: Verification = {
      status: (v.status ?? v.outcome)!,
      detail: v.detail,
      network: v.network ? replay.incident.network : undefined,
      runtimeError: v.runtimeError ? replay.incident.runtimeError : undefined,
    };

    const draft = buildIssueDraft(incident, analysis, verification);
    return { incident, verification, draft, redactions, warnings } as const;
  }

  app.post('/api/github/issues/draft', async (c) => {
    const prepared = await prepareIssue(c);
    if ('response' in prepared) return prepared.response;
    const { verification, draft, redactions, warnings } = prepared;
    return c.json({
      ...draft,
      canCreate: verification.status === 'reproduced' && Boolean(deps.github),
      githubConfigured: Boolean(deps.github),
      redactions,
      warnings,
    });
  });

  app.post('/api/github/issues', async (c) => {
    const prepared = await prepareIssue(c);
    if ('response' in prepared) return prepared.response;
    const { incident, verification, draft, redactions, warnings } = prepared;
    const base = { title: draft.title, markdown: draft.markdown, redactions, warnings };

    if (verification.status !== 'reproduced') {
      return c.json(
        {
          created: false,
          code: 'NOT_REPRODUCED',
          error: `Issue creation requires verification.status "reproduced" (got "${verification.status}")`,
          ...base,
        },
        422,
      );
    }
    if (!deps.github) {
      return c.json(
        {
          created: false,
          code: 'GITHUB_NOT_CONFIGURED',
          error: `GitHub is not configured: ${deps.githubUnavailableReason ?? 'missing GITHUB_TOKEN or GITHUB_REPOSITORY'}`,
          ...base,
        },
        503,
      );
    }

    let pending = inFlight.get(incident.id);
    if (!pending) {
      pending = createGitHubIssue(deps.github, draft, deps.fetch ?? fetch).finally(() => inFlight.delete(incident.id));
      inFlight.set(incident.id, pending);
    }
    try {
      const issue = await pending;
      return c.json({ created: true, issue, ...base }, 201);
    } catch (err) {
      console.error(`[repro-agent] GitHub issue creation failed: ${errorMessage(err)}`);
      const error = err instanceof Error ? err.message : 'GitHub issue creation failed';
      return c.json({ created: false, code: 'GITHUB_API_ERROR', error, ...base }, 502);
    }
  });

  return app;
}
