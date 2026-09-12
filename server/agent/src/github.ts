import { describeAction, requestSignature, runtimeErrorText } from './facts.js';
import { scrubText, truncate } from './sanitize.js';
import type { Incident, IncidentAnalysis, VerificationStatus } from './schemas.js';

export type GitHubConfig = { token: string; owner: string; repo: string };

export type Verification = {
  status: VerificationStatus;
  detail?: string;
  /** Failure signature observed during replay, when the extension reports it. */
  network?: Incident['network'];
  runtimeError?: Incident['runtimeError'];
};

export type IssueDraft = { title: string; markdown: string };
export type CreatedIssue = { number: number; url: string };

const VERIFICATION_TEXT: Record<VerificationStatus, string> = {
  reproduced: 'REPRO replayed the interaction and observed the same failure signature.',
  not_reproduced: 'REPRO replayed the interaction, but the failure did not recur. Not verified.',
  diverged: 'REPRO replayed the interaction and observed a different failure. Not verified.',
  inconclusive: 'REPRO could not complete the replay. Not verified.',
};

/** One line of scrubbed text with @mentions neutralized so an issue cannot ping people. */
function safe(value: string, max = 500): string {
  const text = scrubText(value).text.replace(/\s+/g, ' ').trim();
  return truncate(text.replace(/@(?=[A-Za-z0-9-])/g, '@\u200b'), max);
}

function code(value: string): string {
  const text = safe(value, 300);
  return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
}

/** Builds the issue from deterministic facts plus the (bounded, scrubbed) analysis text. */
export function buildIssueDraft(incident: Incident, analysis: IncidentAnalysis, verification: Verification): IssueDraft {
  const reproduced = verification.status === 'reproduced';
  const { network, runtimeError, page, actions } = incident;
  const out: string[] = [];

  out.push('## Observed failure', '');
  if (network) out.push(requestSignature(network), '');
  if (network?.errorCode || network?.errorMessage) {
    out.push(`Error response: ${code([network.errorCode, network.errorMessage].filter(Boolean).join(': '))}`, '');
  }
  if (runtimeError) out.push(`Runtime error: ${code(runtimeErrorText(runtimeError))}`, '');

  out.push(reproduced ? '## Verified steps to reproduce' : '## Steps to reproduce (not verified)', '');
  analysis.reproductionSteps.forEach((step, i) => out.push(`${i + 1}. ${safe(step, 200)}`));
  out.push('');

  out.push('## Verification', '', VERIFICATION_TEXT[verification.status]);
  if (verification.network) out.push('', `Replay signature: ${code(requestSignature(verification.network))}`);
  if (verification.runtimeError) out.push('', `Replay runtime error: ${code(runtimeErrorText(verification.runtimeError))}`);
  if (verification.detail) out.push('', safe(verification.detail));
  out.push('');

  out.push('## Evidence', '');
  out.push(`- ${actions.length} captured user action${actions.length === 1 ? '' : 's'}`);
  for (const action of actions) {
    out.push(`  - ${safe(describeAction(action), 200)}${action.selector ? ` (${code(action.selector)})` : ''}`);
  }
  if (network) out.push(`- ${network.method} ${network.endpoint}`, `- HTTP ${network.status}`);
  if (runtimeError) out.push(`- Runtime error: ${safe(runtimeError.name ?? 'Error', 100)}`);
  out.push('');

  out.push('## Hypothesis', '', safe(analysis.hypothesis), '');
  out.push(`_Confidence: ${analysis.confidence}. Generated from captured evidence; the hypothesis itself is not verified._`, '');
  if (analysis.evidenceGaps.length) {
    out.push('### Evidence gaps', '', ...analysis.evidenceGaps.map((gap) => `- ${safe(gap, 300)}`), '');
  }

  out.push('## Environment', '', '- Browser: Chrome (REPRO DevTools extension)');
  if (page.route) out.push(`- Route: ${code(page.route)}`);
  if (page.title) out.push(`- Page title: ${safe(page.title, 200)}`);
  out.push('', '---', `_Filed by REPRO after explicit user approval. Incident ${code(incident.id)}._`);

  return { title: safe(analysis.title, 120), markdown: `${out.join('\n')}\n` };
}

export class GitHubIssueError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubIssueError';
  }
}

/** POST /repos/{owner}/{repo}/issues. Needs a token with Issues: write on that repository. */
export async function createGitHubIssue(
  config: GitHubConfig,
  draft: IssueDraft,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<CreatedIssue> {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'repro-agent-server',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title: draft.title, body: draft.markdown }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : 'network error';
    throw new GitHubIssueError(`GitHub request failed: ${reason}`);
  }

  const payload = (await res.json().catch(() => null)) as { number?: unknown; html_url?: unknown; message?: unknown } | null;
  if (res.status !== 201 || typeof payload?.number !== 'number' || typeof payload.html_url !== 'string') {
    const detail = typeof payload?.message === 'string' ? `: ${scrubText(payload.message).text.slice(0, 200)}` : '';
    throw new GitHubIssueError(`GitHub API returned ${res.status}${detail}`, res.status);
  }
  return { number: payload.number, url: payload.html_url };
}

/** Accepts GITHUB_REPOSITORY="owner/repo". Returns null (with a reason) when not fully configured. */
export function readGitHubConfig(env: NodeJS.ProcessEnv): { config: GitHubConfig | null; reason?: string } {
  const token = env.GITHUB_TOKEN?.trim();
  const [owner, repo, extra] = (env.GITHUB_REPOSITORY ?? '').trim().split('/');
  if (!token) return { config: null, reason: 'GITHUB_TOKEN is not set' };
  if (!owner || !repo || extra !== undefined) return { config: null, reason: 'GITHUB_REPOSITORY must be "owner/repo"' };
  return { config: { token, owner, repo } };
}
