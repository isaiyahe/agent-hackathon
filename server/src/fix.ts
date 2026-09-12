import { Agent, run } from "@openai/agents";
import { createTwoFilesPatch } from "diff";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Incident, IncidentAnalysis } from "../../packages/core/schemas.ts";
import { sanitizeIncident } from "../../packages/core/sanitize.ts";

export const FIX_TIMEOUT_MS = 30_000;
export const MAX_CHANGED_LINES = 60;
export const MAX_FILE_BYTES = 40_000;

/** Repo root, resolved from this file so it works no matter the cwd. */
export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

/** The ONLY directories the fix agent may touch. Enforced in apply, not just the prompt. */
export const ALLOWED_DIRS = ["apps/demo/server"];

export const FixRequest = z.object({ incident: Incident, analysis: IncidentAnalysis });
export type FixRequest = z.infer<typeof FixRequest>;

/** What the model returns: one exact-match edit in one file. No free-form diffs. */
export const FixProposalOutput = z.object({
  path: z.string(),
  oldSnippet: z.string().min(1),
  newSnippet: z.string(),
  explanation: z.string().max(400),
});
export type FixProposalOutput = z.infer<typeof FixProposalOutput>;

export interface FixProposal extends FixProposalOutput {
  id: string;
  diff: string;
  changedLines: number;
  createdAt: string;
  before: string; // full file contents before
  after: string; // full file contents after
  applied: boolean;
}

const INSTRUCTIONS = `You are REPRO's implementer. You receive a verified browser incident, an
analysis, and the full contents of the files you are allowed to edit.

Propose the SMALLEST change that fixes the root cause. Rules:
- Edit exactly one file from the list provided. Use its path verbatim.
- oldSnippet must be copied EXACTLY from the file (whitespace included) and
  must occur exactly once. newSnippet replaces it.
- Do not add logging, comments, refactors, or unrelated changes.
- Do not weaken validation or security to make the error go away.
- If you cannot identify a safe fix, set oldSnippet to the single line most
  related to the failure and newSnippet to the same line, and explain why.`;

let cachedAgent: Agent<unknown, typeof FixProposalOutput> | undefined;

export type FixRunner = (prompt: string, signal: AbortSignal) => Promise<unknown>;

export const openaiFixRunner: FixRunner = async (prompt, signal) => {
  cachedAgent ??= new Agent({
    name: "REPRO implementer",
    modelSettings: { temperature: 0 },
    model: process.env.OPENAI_FIX_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    instructions: INSTRUCTIONS,
    outputType: FixProposalOutput,
  });
  const result = await run(cachedAgent, prompt, { signal, maxTurns: 1 });
  return result.finalOutput;
};

export function isAllowedPath(rel: string): boolean {
  const norm = path.posix.normalize(rel.replace(/\\/g, "/"));
  if (norm.startsWith("..") || path.posix.isAbsolute(norm)) return false;
  return ALLOWED_DIRS.some((d) => norm === d || norm.startsWith(d + "/"));
}

async function listAllowedFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of ALLOWED_DIRS) {
    const abs = path.join(root, dir);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(abs);
    } catch {
      continue;
    }
    for (const e of entries) {
      const rel = path.posix.join(dir, e);
      const st = await fs.stat(path.join(root, rel));
      if (st.isFile() && st.size <= MAX_FILE_BYTES) out.push(rel);
    }
  }
  return out;
}

export function countChangedLines(diff: string): number {
  return diff
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .length;
}

/** Pure: turn a model edit into a verified proposal against real file contents. Throws with a reason on any rule violation. */
export function buildProposal(edit: FixProposalOutput, fileContents: Record<string, string>): Omit<FixProposal, "id" | "createdAt" | "applied"> {
  if (!isAllowedPath(edit.path)) throw new Error(`path not allowed: ${edit.path}`);
  const before = fileContents[edit.path];
  if (before === undefined) throw new Error(`file not provided to agent: ${edit.path}`);
  const idx = before.indexOf(edit.oldSnippet);
  if (idx === -1) throw new Error("oldSnippet not found in file");
  if (before.indexOf(edit.oldSnippet, idx + 1) !== -1) throw new Error("oldSnippet is not unique in file");
  if (edit.oldSnippet === edit.newSnippet) throw new Error("no change proposed: " + edit.explanation);
  const after = before.slice(0, idx) + edit.newSnippet + before.slice(idx + edit.oldSnippet.length);
  const diff = createTwoFilesPatch(`a/${edit.path}`, `b/${edit.path}`, before, after, "", "", { context: 3 });
  const changedLines = countChangedLines(diff);
  if (changedLines > MAX_CHANGED_LINES) throw new Error(`diff too large: ${changedLines} > ${MAX_CHANGED_LINES} lines`);
  return { ...edit, diff, changedLines, before, after };
}

export interface FixStore {
  proposals: Map<string, FixProposal>;
}
export const store: FixStore = { proposals: new Map() };

export interface ProposeOptions {
  runner?: FixRunner;
  root?: string;
  timeoutMs?: number;
  log?: (m: string) => void;
}

export type ProposeResult =
  | { ok: true; proposalId: string; path: string; diff: string; changedLines: number; explanation: string }
  | { ok: false; reason: string };

export async function proposeFix(input: unknown, opts: ProposeOptions = {}): Promise<ProposeResult> {
  const req = FixRequest.parse(input);
  const incident = sanitizeIncident(req.incident);
  const root = opts.root ?? REPO_ROOT;
  const log = opts.log ?? ((m) => console.warn(`[fix] ${m}`));

  const files = await listAllowedFiles(root);
  if (files.length === 0) return { ok: false, reason: "no editable files found" };
  const contents: Record<string, string> = {};
  for (const f of files) contents[f] = await fs.readFile(path.join(root, f), "utf8");

  const prompt = [
    "## Incident (verified by replay)",
    JSON.stringify(incident, null, 2),
    "## Analysis",
    JSON.stringify(req.analysis, null, 2),
    "## Editable files",
    ...files.map((f) => `### ${f}\n\`\`\`\n${contents[f]}\n\`\`\``),
  ].join("\n\n");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("fix timeout")), opts.timeoutMs ?? FIX_TIMEOUT_MS);
  try {
    const raw = await (opts.runner ?? openaiFixRunner)(prompt, ac.signal);
    const edit = FixProposalOutput.parse(raw);
    const built = buildProposal(edit, contents);
    const id = `fix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const proposal: FixProposal = { ...built, id, createdAt: new Date().toISOString(), applied: false };
    store.proposals.set(id, proposal);
    return { ok: true, proposalId: id, path: built.path, diff: built.diff, changedLines: built.changedLines, explanation: built.explanation };
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    log(`propose failed: ${reason}`);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Write the proposal to disk. Refuses if the file changed since the proposal was built. */
export async function applyFix(proposalId: string, root = REPO_ROOT): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const p = store.proposals.get(proposalId);
  if (!p) return { ok: false, reason: "unknown proposal" };
  if (!isAllowedPath(p.path)) return { ok: false, reason: "path not allowed" };
  const abs = path.join(root, p.path);
  const current = await fs.readFile(abs, "utf8");
  if (current !== p.before) return { ok: false, reason: "file changed since proposal; re-run Fix" };
  await fs.writeFile(abs, p.after, "utf8");
  p.applied = true;
  return { ok: true, path: p.path };
}

/** Restore the pre-fix contents. Idempotent. */
export async function revertFix(proposalId: string, root = REPO_ROOT): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  const p = store.proposals.get(proposalId);
  if (!p) return { ok: false, reason: "unknown proposal" };
  const abs = path.join(root, p.path);
  await fs.writeFile(abs, p.before, "utf8");
  p.applied = false;
  return { ok: true, path: p.path };
}
