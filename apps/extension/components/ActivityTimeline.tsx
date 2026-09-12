import { describeAction, formatTime, requestLine } from '../lib/format';
import type { ActionEvent, NetworkFailure } from '../lib/types';
import { CheckIcon, CrossIcon } from './icons';

type ActivityTimelineProps = {
  actions: ActionEvent[];
  /** Failed request, rendered as the final row. */
  network?: NetworkFailure;
  /** Numbered incident timeline with relative offsets, instead of the live activity feed. */
  numbered?: boolean;
  emptyText?: string;
};

export function ActivityTimeline({
  actions,
  network,
  numbered = false,
  emptyText = 'Waiting for browser activity...',
}: ActivityTimelineProps) {
  if (actions.length === 0 && !network) {
    return (
      <div className="timeline-empty">
        <span className="status-dot pulse" aria-hidden="true" />
        {emptyText}
      </div>
    );
  }

  const origin = actions[0]?.timestamp ?? network?.timestamp ?? 0;
  const when = (timestamp: number) =>
    numbered ? `+${((timestamp - origin) / 1000).toFixed(1)}s` : formatTime(timestamp);

  return (
    <ol className={`timeline${numbered ? ' is-numbered' : ''}`}>
      {actions.map((action, index) => (
        <li key={action.id} className="timeline-row">
          <span className="timeline-marker">{numbered ? index + 1 : <CheckIcon size={11} />}</span>
          <span className="timeline-label">{numbered ? action.label : describeAction(action)}</span>
          <code className="timeline-meta" title={action.selector}>
            {numbered && <span className="tag">{action.type}</span>}
            {action.selector}
          </code>
          <time className="timeline-time" dateTime={new Date(action.timestamp).toISOString()}>
            {when(action.timestamp)}
          </time>
        </li>
      ))}
      {network && (
        <li className="timeline-row is-failure">
          <span className="timeline-marker">
            {numbered ? actions.length + 1 : <CrossIcon size={11} />}
          </span>
          <code className="timeline-label" title={network.endpoint}>
            {requestLine(network)} → {network.status}
          </code>
          <code className="timeline-meta">{numbered && <span className="tag">fetch</span>}</code>
          {network.timestamp !== undefined && (
            <time className="timeline-time" dateTime={new Date(network.timestamp).toISOString()}>
              {when(network.timestamp)}
            </time>
          )}
        </li>
      )}
    </ol>
  );
}
