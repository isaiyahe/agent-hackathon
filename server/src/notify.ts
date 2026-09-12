import { z } from "zod";
import { IncidentAnalysis, Incident, ReplayOutcome } from "../../packages/core/schemas.ts";

export const NOTIFY_TIMEOUT_MS = 5_000;

export const NotifyRequest = z.object({
  incident: Incident,
  analysis: IncidentAnalysis,
  replay: z.object({ outcome: ReplayOutcome }),
  issueUrl: z.string().url().optional(),
  fix: z
    .object({
      status: z.enum(["verified", "rejected", "not_attempted", "proposed"]),
      prUrl: z.string().url().optional(),
      explanation: z.string().optional(),
    })
    .optional(),
});
export type NotifyRequest = z.infer<typeof NotifyRequest>;

const SEV_ICON: Record<NotifyRequest["analysis"]["severity"], string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🟢",
};
const FIX_LINE: Record<NonNullable<NotifyRequest["fix"]>["status"], string> = {
  verified: "✅ Agent fixed it and replay confirmed the failure is gone",
  rejected: "❌ Agent proposed a fix, but replay still failed; change was reverted",
  proposed: "📝 Agent proposed a fix; waiting for approval",
  not_attempted: "⏸ No fix attempted",
};

/** Deterministic message. Same text goes to every channel. */
export function buildMessage(req: NotifyRequest): string {
  const { analysis: a, incident: i, replay, issueUrl, fix } = req;
  const lines = [
    `${SEV_ICON[a.severity]} *${a.severity.toUpperCase()}* — ${a.title}`,
    `Impact: ${a.impact}`,
    `Where: ${i.failedRequest.method} ${i.failedRequest.endpoint} → ${i.failedRequest.status} on ${i.page.url}`,
    `Verification: ${replay.outcome.replace("_", " ")}`,
    `Fix: ${FIX_LINE[fix?.status ?? "not_attempted"]}`,
  ];
  if (fix?.prUrl) lines.push(`PR: ${fix.prUrl}`);
  if (issueUrl) lines.push(`Issue: ${issueUrl}`);
  lines.push(`Hypothesis (${a.confidence}): ${a.hypothesis}`);
  return lines.join("\n");
}

export type Fetcher = typeof fetch;

export interface Channel {
  name: string;
  send: (text: string, signal: AbortSignal, fetcher: Fetcher) => Promise<void>;
}

export function channelsFromEnv(env: NodeJS.ProcessEnv = process.env): Channel[] {
  const out: Channel[] = [];
  if (env.SLACK_WEBHOOK_URL) {
    const url = env.SLACK_WEBHOOK_URL;
    out.push({
      name: "slack",
      send: async (text, signal, fetcher) => {
        const r = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal });
        if (!r.ok) throw new Error(`slack ${r.status}`);
      },
    });
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const chat_id = env.TELEGRAM_CHAT_ID;
    out.push({
      name: "telegram",
      send: async (text, signal, fetcher) => {
        const r = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id, text: text.replace(/\*/g, "") }), signal });
        if (!r.ok) throw new Error(`telegram ${r.status}`);
      },
    });
  }
  return out;
}

export interface NotifyResult {
  ok: boolean;
  message: string;
  sent: string[];
  failed: { channel: string; reason: string }[];
  configured: boolean;
}

export interface NotifyOptions {
  channels?: Channel[];
  fetcher?: Fetcher;
  timeoutMs?: number;
  log?: (m: string) => void;
}

/** Never throws for delivery problems; reports per channel. Throws only for an invalid body. */
export async function notify(input: unknown, opts: NotifyOptions = {}): Promise<NotifyResult> {
  const req = NotifyRequest.parse(input);
  const message = buildMessage(req);
  const channels = opts.channels ?? channelsFromEnv();
  const log = opts.log ?? ((m) => console.warn(`[notify] ${m}`));
  if (channels.length === 0) return { ok: true, message, sent: [], failed: [], configured: false };

  const sent: string[] = [];
  const failed: { channel: string; reason: string }[] = [];
  await Promise.all(
    channels.map(async (ch) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(new Error("notify timeout")), opts.timeoutMs ?? NOTIFY_TIMEOUT_MS);
      try {
        await ch.send(message, ac.signal, opts.fetcher ?? fetch);
        sent.push(ch.name);
      } catch (err) {
        const reason = (err as Error).message ?? String(err);
        log(`${ch.name} failed: ${reason}`);
        failed.push({ channel: ch.name, reason });
      } finally {
        clearTimeout(t);
      }
    }),
  );
  return { ok: failed.length === 0, message, sent, failed, configured: true };
}
