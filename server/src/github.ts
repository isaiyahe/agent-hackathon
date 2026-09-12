import { Octokit } from "octokit";
import { IssueRequest } from "../../packages/core/schemas.ts";

export const GITHUB_TIMEOUT_MS = 10_000;

const OUTCOME_LABEL: Record<IssueRequest["replay"]["outcome"], string> = {
  reproduced: "✅ Reproduced by replay",
  not_reproduced: "⚪ Not reproduced by replay",
  diverged: "⚠️ Replay diverged (different failure)",
  inconclusive: "❔ Replay inconclusive",
};

/** Deterministic issue body. Every fact comes from the incident; the model text is quoted as analysis. */
export function buildIssueMarkdown(req: IssueRequest): { title: string; body: string } {
  const { incident, analysis, replay } = req;
  const fr = incident.failedRequest;
  const lines: string[] = [];

  lines.push(`> Witnessed by REPRO in Chrome DevTools at ${incident.capturedAt}.`);
  lines.push(`> **Verification:** ${OUTCOME_LABEL[replay.outcome]}`);
  lines.push("");
  lines.push("## Failure signature");
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| Request | \`${fr.method} ${fr.endpoint}\` |`);
  lines.push(`| Status | **${fr.status}** |`);
  lines.push(`| Page | ${incident.page.title} (\`${incident.page.url}\`) |`);
  if (incident.runtimeError) {
    lines.push(`| Runtime error | \`${incident.runtimeError.message}\` |`);
  }
  lines.push("");
  lines.push("## Steps to reproduce");
  lines.push("");
  analysis.reproductionSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");
  lines.push("## Observed");
  lines.push("");
  analysis.observed.forEach((o) => lines.push(`- ${o}`));
  lines.push("");
  lines.push(`## Hypothesis (confidence: ${analysis.confidence})`);
  lines.push("");
  lines.push(analysis.hypothesis);
  if (analysis.evidenceGaps.length) {
    lines.push("");
    lines.push("**Evidence gaps**");
    lines.push("");
    analysis.evidenceGaps.forEach((g) => lines.push(`- ${g}`));
  }
  if (analysis.safetyWarnings.length) {
    lines.push("");
    lines.push("**Safety warnings**");
    lines.push("");
    analysis.safetyWarnings.forEach((w) => lines.push(`- ⚠️ ${w}`));
  }
  if (replay.observed && replay.outcome === "diverged" && replay.observed.failedRequest) {
    const o = replay.observed.failedRequest;
    lines.push("");
    lines.push(`**Replay observed instead:** \`${o.method} ${o.endpoint}\` → ${o.status}`);
  }
  lines.push("");
  lines.push("<details><summary>Captured actions</summary>");
  lines.push("");
  lines.push("| t (ms) | kind | locator | label |");
  lines.push("|---|---|---|---|");
  incident.actions.forEach((a) =>
    lines.push(`| ${a.t} | ${a.kind} | \`${a.locator}\` | ${a.label}${a.value ? ` = \`${a.value}\`` : ""} |`),
  );
  lines.push("");
  lines.push("</details>");
  if (incident.runtimeError?.stack) {
    lines.push("");
    lines.push("<details><summary>Stack</summary>");
    lines.push("");
    lines.push("```");
    lines.push(incident.runtimeError.stack);
    lines.push("```");
    lines.push("");
    lines.push("</details>");
  }
  lines.push("");
  lines.push("---");
  lines.push("_Filed by REPRO after explicit user approval. Capture, replay, and signature matching were deterministic; the hypothesis is model-generated._");

  return { title: analysis.title, body: lines.join("\n") };
}

export type IssueCreator = (args: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels: string[];
  signal: AbortSignal;
}) => Promise<{ url: string; number: number }>;

export const octokitCreator: IssueCreator = async ({ owner, repo, title, body, labels, signal }) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.startsWith("ghp_...")) throw new Error("GITHUB_TOKEN not configured");
  const octokit = new Octokit({ auth: token, request: { signal } });
  const res = await octokit.rest.issues.create({ owner, repo, title, body, labels });
  return { url: res.data.html_url, number: res.data.number };
};

export type IssueResult =
  | { ok: true; url: string; number: number; markdown: string }
  | { ok: false; reason: string; markdown: string };

export interface IssueOptions {
  creator?: IssueCreator;
  repo?: string; // "owner/name"
  timeoutMs?: number;
  log?: (msg: string) => void;
}

/**
 * Validate, build markdown, create the issue. On any GitHub failure return
 * ok:false WITH the markdown so the panel can offer Retry / Copy Markdown.
 * Throws only for an invalid request body.
 */
export async function createIssue(input: unknown, opts: IssueOptions = {}): Promise<IssueResult> {
  const req = IssueRequest.parse(input);
  const { title, body } = buildIssueMarkdown(req);
  const markdown = `# ${title}\n\n${body}`;
  const log = opts.log ?? ((m) => console.warn(`[issue] ${m}`));

  const repoSpec = opts.repo ?? process.env.GITHUB_REPO ?? "";
  const [owner, repo] = repoSpec.split("/");
  if (!owner || !repo) {
    log("GITHUB_REPO not set");
    return { ok: false, reason: "GITHUB_REPO not configured (expected owner/name)", markdown };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("github timeout")), opts.timeoutMs ?? GITHUB_TIMEOUT_MS);
  try {
    const creator = opts.creator ?? octokitCreator;
    const { url, number } = await creator({
      owner,
      repo,
      title,
      body,
      labels: ["bug", "repro", `replay:${req.replay.outcome}`],
      signal: ac.signal,
    });
    return { ok: true, url, number, markdown };
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    log(`create failed: ${reason}`);
    return { ok: false, reason, markdown };
  } finally {
    clearTimeout(timer);
  }
}
