import type { ActionEvent, Incident, PageInfo, ReproState } from '../types';
import type { PageSnapshot } from './collector';
import type { InspectedPage } from './devtools';
import { buildIncident, pushActions, shouldTriggerIncident, type FinishedRequest } from './incident.ts';

export type LiveCaptureState = {
  state: Extract<ReproState, 'watching' | 'recording' | 'failure'>;
  /** Rolling buffer of recent clicks. */
  actions: ActionEvent[];
  /** Frozen once the checkout request fails; later clicks and failures leave it untouched. */
  incident?: Incident;
};

export type LiveCapture = {
  /** Drops the incident and buffered actions, and keeps watching. */
  clear(): void;
  stop(): void;
};

type LiveCaptureOptions = {
  pollMs?: number;
  now?: () => number;
  newId?: () => string;
};

/**
 * The witness phase for one DevTools panel session, held in memory only: polls the
 * inspected page for clicks and freezes an incident when the checkout request fails.
 */
export function startLiveCapture(
  page: InspectedPage,
  onChange: (capture: LiveCaptureState) => void,
  { pollMs = 250, now = Date.now, newId = () => crypto.randomUUID() }: LiveCaptureOptions = {},
): LiveCapture {
  let actions: ActionEvent[] = [];
  let incident: Incident | undefined;
  let lastPage: PageInfo = { url: '', title: '' };
  // Bumped on clear and navigation, so drains that started before it are discarded.
  let epoch = 0;
  let needsReset = true;
  let freezing = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Drains run one at a time, so a slow poll can never land after the incident's final drain.
  let drains: Promise<unknown> = Promise.resolve();

  function emit() {
    const state = incident ? 'failure' : actions.length > 0 ? 'recording' : 'watching';
    onChange({ state, actions, incident });
  }

  function drain(): Promise<PageSnapshot> {
    const startedIn = epoch;
    const drained = drains.then(async () => {
      const snapshot = await page.drain(needsReset);
      needsReset = false;
      if (startedIn !== epoch || stopped) return snapshot;
      lastPage = snapshot.page;
      if (!incident && snapshot.clicks.length > 0) {
        actions = pushActions(actions, snapshot.clicks.map((click) => ({ id: newId(), ...click })));
        emit();
      }
      return snapshot;
    });
    drains = drained.catch(() => undefined);
    return drained;
  }

  async function poll() {
    try {
      await drain();
    } catch {
      // The page may be mid-navigation or not scriptable yet: retry on the next tick.
    }
    if (!stopped) timer = setTimeout(poll, pollMs);
  }

  async function onRequestFinished(request: FinishedRequest) {
    if (incident || freezing || !shouldTriggerIncident(request)) return;
    freezing = true;
    const detectedAt = now();
    const startedIn = epoch;
    let pageInfo = lastPage;
    try {
      // A final drain picks up clicks still queued in the page, such as the Checkout click itself.
      pageInfo = (await drain()).page;
    } catch {
      // Freeze with what the buffer already holds.
    } finally {
      freezing = false;
    }
    if (stopped || startedIn !== epoch) return;
    incident = buildIncident({ id: newId(), detectedAt, page: pageInfo, actions, request });
    emit();
  }

  function reset() {
    epoch += 1;
    actions = [];
    incident = undefined;
    emit();
  }

  const offRequestFinished = page.onRequestFinished((request) => void onRequestFinished(request));
  // A reload or navigation makes buffered actions stale. The collector reinstalls on the next poll.
  const offNavigated = page.onNavigated(reset);
  emit();
  void poll();

  return {
    clear: reset,
    stop() {
      stopped = true;
      clearTimeout(timer);
      offRequestFinished();
      offNavigated();
    },
  };
}
