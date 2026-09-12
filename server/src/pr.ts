import { Octokit } from "octokit";
import { z } from "zod";
import { ReplayOutcome } from "../../packages/core/schemas.ts";
import { store, type FixProposal } from "./fix.ts";

export const PR_TIMEOUT_MS = 20_000;

export const PrRequest = z.object({
  proposalId: z.string(),
  before: ReplayOutcome, // replay result on the broken app (must be "reproduced")
  after: ReplayOutcome, // replay result after apply (must be "not_reproduced")
  issueUrl: z.string().url().optional(),
});
export type PrRequest = z.infer<typeof PrRequest>;

/** apps/demo/server/index.js in the monorepo is server/index.js in the mirror repo. */
export function toMirrorPath(monorepoPath: string): string {
  return monorepoPath.replace(/^apps\/demo\//, "");
}

export function buildPrBody(p: FixProposal, req: PrRequest): { title: string; body: string } {
  const issueNum = req.issueUrl?.match(/\/issues\/(\d+)$/)?.[1];
  const lines = [
    `> Proposed by REPRO after the fix was **verified by replay**. A human must review and merge.`,
    "",
    "## What changed",
    "",
    p.explanation,
    "",
    "```diff",
    p.diff.trim(),
    "```",
    "",
    "## Evidence",
    "",
    "| Replay | Outcome |",
    "|---|---|",
    `| Before fix | ${req.before} |`,
    `| After fix | **${req.after}** |`,
    "",
    "The same recorded user actions were replayed against the running app before and after this change. " +
      "The failure signature (endpoint, method, status, runtime error) was present before and absent after.",
  ];
  if (req.issueUrl) {
    lines.push("", issueNum ? `Closes #${issueNum}` : `Issue: ${req.issueUrl}`);
  }
  lines.push("", "---", "_The model proposed the edit. Allowlist, size cap, apply, and both replays were deterministic. Nothing was merged automatically._");
  return { title: `fix: ${p.explanation.split(/[.\n]/)[0].slice(0, 70)}`, body: lines.join("\n") };
}

/** Thin client so tests can inject a fake. */
export interface GitClient {
  getMainSha(owner: string, repo: string, signal: AbortSignal): Promise<{ sha: string; branch: string }>;
  createBranch(owner: string, repo: string, name: string, sha: string, signal: AbortSignal): Promise<void>;
  getFileSha(owner: string, repo: string, path: string, ref: string, signal: AbortSignal): Promise<string | undefined>;
  putFile(owner: string, repo: string, path: string, branch: string, content: string, message: string, sha: string | undefined, signal: AbortSignal): Promise<void>;
  createPr(owner: string, repo: string, head: string, base: string, title: string, body: string, signal: AbortSignal): Promise<{ url: string; number: number }>;
}

export function octokitClient(token = process.env.GITHUB_TOKEN): GitClient {
  if (!token || token.startsWith("ghp_...")) throw new Error("GITHUB_TOKEN not configured");
  const ok = new Octokit({ auth: token });
  return {
    async getMainSha(owner, repo, signal) {
      const r = await ok.rest.repos.get({ owner, repo, request: { signal } });
      const branch = r.data.default_branch;
      const ref = await ok.rest.git.getRef({ owner, repo, ref: `heads/${branch}`, request: { signal } });
      return { sha: ref.data.object.sha, branch };
    },
    async createBranch(owner, repo, name, sha, signal) {
      await ok.rest.git.createRef({ owner, repo, ref: `refs/heads/${name}`, sha, request: { signal } });
    },
    async getFileSha(owner, repo, path, ref, signal) {
      try {
        const r = await ok.rest.repos.getContent({ owner, repo, path, ref, request: { signal } });
        return Array.isArray(r.data) ? undefined : (r.data as { sha: string }).sha;
      } catch (e) {
        if ((e as { status?: number }).status === 404) return undefined;
        throw e;
      }
    },
    async putFile(owner, repo, path, branch, content, message, sha, signal) {
      await ok.rest.repos.createOrUpdateFileContents({
        owner, repo, path, branch, message, sha,
        content: Buffer.from(content, "utf8").toString("base64"),
        request: { signal },
      });
    },
    async createPr(owner, repo, head, base, title, body, signal) {
      const r = await ok.rest.pulls.create({ owner, repo, head, base, title, body, request: { signal } });
      return { url: r.data.html_url, number: r.data.number };
    },
  };
}

export type PrResult =
  | { ok: true; url: string; number: number; branch: string }
  | { ok: false; reason: string };

export interface PrOptions {
  client?: GitClient;
  repo?: string;
  timeoutMs?: number;
  log?: (m: string) => void;
}

/**
 * Open a PR on the mirror repo for a proposal whose fix was verified by replay.
 * Refuses (ok:false) unless before === "reproduced" and after === "not_reproduced".
 */
export async function openFixPr(input: unknown, opts: PrOptions = {}): Promise<PrResult> {
  const req = PrRequest.parse(input);
  const log = opts.log ?? ((m) => console.warn(`[pr] ${m}`));
  const p = store.proposals.get(req.proposalId);
  if (!p) return { ok: false, reason: "unknown proposal" };
  if (req.before !== "reproduced") return { ok: false, reason: `bug was not reproduced before the fix (${req.before}); refusing to open PR` };
  if (req.after !== "not_reproduced") return { ok: false, reason: `fix not verified: replay after apply was ${req.after}` };

  const [owner, repo] = (opts.repo ?? process.env.GITHUB_REPO ?? "").split("/");
  if (!owner || !repo) return { ok: false, reason: "GITHUB_REPO not configured" };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("github timeout")), opts.timeoutMs ?? PR_TIMEOUT_MS);
  try {
    const client = opts.client ?? octokitClient();
    const branch = `repro/fix-${p.id.replace(/^fix_/, "")}`;
    const mirrorPath = toMirrorPath(p.path);
    const { sha, branch: base } = await client.getMainSha(owner, repo, ac.signal);
    await client.createBranch(owner, repo, branch, sha, ac.signal);
    const fileSha = await client.getFileSha(owner, repo, mirrorPath, base, ac.signal);
    const { title, body } = buildPrBody(p, req);
    await client.putFile(owner, repo, mirrorPath, branch, p.after, `${title}\n\nProposed by REPRO; verified by replay.`, fileSha, ac.signal);
    const pr = await client.createPr(owner, repo, branch, base, title, body, ac.signal);
    return { ok: true, url: pr.url, number: pr.number, branch };
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    log(`open PR failed: ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
