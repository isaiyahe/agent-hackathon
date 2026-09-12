import { beforeEach, describe, expect, it } from "vitest";
import { store, type FixProposal } from "./fix.ts";
import { buildPrBody, openFixPr, toMirrorPath, type GitClient } from "./pr.ts";

const proposal: FixProposal = {
  id: "fix_abc123",
  path: "apps/demo/server/index.js",
  oldSnippet: "const customerId = s.customer.id;",
  newSnippet: "const customerId = s.customer?.id ?? null;",
  explanation: "Guests have no customer record. Default the id to null.",
  diff: "--- a/apps/demo/server/index.js\n+++ b/apps/demo/server/index.js\n@@ -1 +1 @@\n-old\n+new\n",
  changedLines: 2,
  createdAt: "2026-09-12T14:00:00.000Z",
  before: "old",
  after: "new",
  applied: true,
};
const good = { proposalId: "fix_abc123", before: "reproduced", after: "not_reproduced", issueUrl: "https://github.com/a/b/issues/9" };
const quiet = { log: () => {} };

function fakeClient(calls: string[]): GitClient {
  return {
    getMainSha: async () => (calls.push("getMainSha"), { sha: "deadbeef", branch: "main" }),
    createBranch: async (_o, _r, name) => void calls.push(`createBranch:${name}`),
    getFileSha: async (_o, _r, path) => (calls.push(`getFileSha:${path}`), "f00"),
    putFile: async (_o, _r, path, branch, content, _m, sha) => void calls.push(`putFile:${path}@${branch}:${content}:${sha}`),
    createPr: async (_o, _r, head, base, title) => (calls.push(`createPr:${head}->${base}:${title}`), { url: "https://github.com/a/b/pull/3", number: 3 }),
  };
}

beforeEach(() => {
  store.proposals.clear();
  store.proposals.set(proposal.id, proposal);
});

describe("toMirrorPath", () => {
  it("strips the apps/demo prefix", () => {
    expect(toMirrorPath("apps/demo/server/index.js")).toBe("server/index.js");
    expect(toMirrorPath("server/index.js")).toBe("server/index.js");
  });
});

describe("buildPrBody", () => {
  it("has the diff, both replay outcomes, and closes the issue", () => {
    const { title, body } = buildPrBody(proposal, good as any);
    expect(title).toBe("fix: Guests have no customer record");
    expect(body).toContain("```diff");
    expect(body).toContain("| Before fix | reproduced |");
    expect(body).toContain("| After fix | **not_reproduced** |");
    expect(body).toContain("Closes #9");
    expect(body).toContain("Nothing was merged automatically");
  });
});

describe("openFixPr", () => {
  it("refuses when the fix was not verified", async () => {
    const calls: string[] = [];
    const r = await openFixPr({ ...good, after: "reproduced" }, { ...quiet, repo: "a/b", client: fakeClient(calls) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/fix not verified/);
    expect(calls).toEqual([]);
  });
  it("refuses when the bug was never reproduced", async () => {
    const r = await openFixPr({ ...good, before: "inconclusive" }, { ...quiet, repo: "a/b", client: fakeClient([]) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not reproduced before/);
  });
  it("refuses an unknown proposal and a missing repo", async () => {
    expect((await openFixPr({ ...good, proposalId: "nope" }, { ...quiet, repo: "a/b", client: fakeClient([]) })).ok).toBe(false);
    expect((await openFixPr(good, { ...quiet, repo: "", client: fakeClient([]) })).ok).toBe(false);
  });
  it("creates branch, writes the mirror path, opens the PR", async () => {
    const calls: string[] = [];
    const r = await openFixPr(good, { ...quiet, repo: "a/b", client: fakeClient(calls) });
    expect(r).toMatchObject({ ok: true, url: "https://github.com/a/b/pull/3", number: 3, branch: "repro/fix-abc123" });
    expect(calls).toEqual([
      "getMainSha",
      "createBranch:repro/fix-abc123",
      "getFileSha:server/index.js",
      "putFile:server/index.js@repro/fix-abc123:new:f00",
      "createPr:repro/fix-abc123->main:fix: Guests have no customer record",
    ]);
  });
  it("returns ok:false on a GitHub error", async () => {
    const c = fakeClient([]);
    c.createBranch = async () => { throw new Error("Reference already exists"); };
    const r = await openFixPr(good, { ...quiet, repo: "a/b", client: c });
    expect(r).toEqual({ ok: false, reason: "Reference already exists" });
  });
});
