import type { ReactNode } from 'react';
import { displayEndpoint, errorParts, statusText } from '../lib/format';
import type { Incident, NetworkFailure, RuntimeError } from '../lib/types';

export type CardTone = 'neutral' | 'danger' | 'success' | 'warning';

type EvidenceCardProps = {
  label: string;
  tone?: CardTone;
  /** Right side of the card header, e.g. a source tag. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function EvidenceCard({ label, tone = 'neutral', aside, className, children }: EvidenceCardProps) {
  return (
    <section className={['card', `tone-${tone}`, className].filter(Boolean).join(' ')}>
      <header className="card-header">
        <h3 className="label">{label}</h3>
        {aside}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** Marks where a fact came from: captured browser evidence vs. model inference. */
export function SourceTag({ kind }: { kind: 'captured' | 'inferred' | 'replay' }) {
  return <span className={`source-tag source-${kind}`}>{kind}</span>;
}

export function NetworkSignature({ network }: { network: NetworkFailure }) {
  return (
    <div className="signature">
      <code className="signature-request" title={network.endpoint}>
        <span className="method">{network.method}</span> {displayEndpoint(network.endpoint)}
      </code>
      <code className="signature-status">
        {network.status} {statusText(network)}
      </code>
    </div>
  );
}

export function ErrorSignature({ error }: { error: RuntimeError }) {
  const { name, message } = errorParts(error);
  return (
    <div className="signature">
      <code className="error-name">{name}</code>
      <code className="error-message">{message}</code>
    </div>
  );
}

export function EvidenceCounts({ incident }: { incident: Incident }) {
  const counts = [
    { count: incident.actions.length, one: 'Action', many: 'Actions', danger: false },
    { count: incident.network ? 1 : 0, one: 'Failed Request', many: 'Failed Requests', danger: true },
    { count: incident.runtimeError ? 1 : 0, one: 'Runtime Error', many: 'Runtime Errors', danger: true },
  ];
  return (
    <ul className="counts">
      {counts.map(({ count, one, many, danger }) => (
        <li key={one} className={count === 0 ? 'count is-zero' : danger ? 'count is-danger' : 'count'}>
          <span className="count-value">{count}</span>
          <span className="count-label">{count === 1 ? one : many}</span>
        </li>
      ))}
    </ul>
  );
}
