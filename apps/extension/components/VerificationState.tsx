import { formatError, pluralize, requestLine, statusText } from '../lib/format';
import type {
  Incident,
  IncidentAnalysis,
  NetworkFailure,
  RuntimeError,
  VerificationOutcome,
  VerificationResult,
} from '../lib/types';
import { EvidenceCard, SourceTag } from './EvidenceCard';
import { AlertIcon, CheckIcon, Spinner } from './icons';

type VerificationStateProps = {
  incident: Incident;
  analysis?: IncidentAnalysis;
  /** Omit while the replay is still running. */
  result?: VerificationResult;
};

export function VerificationState({ incident, analysis, result }: VerificationStateProps) {
  return result ? (
    <VerificationResultView incident={incident} result={result} />
  ) : (
    <VerificationProgress stepCount={analysis?.reproductionSteps.length ?? incident.actions.length} />
  );
}

function VerificationProgress({ stepCount }: { stepCount: number }) {
  const steps = [
    { label: 'Observed', detail: 'Failure captured' },
    { label: 'Correlated', detail: 'Browser evidence linked' },
    { label: 'Reconstructed', detail: pluralize(stepCount, 'reproduction step') },
  ];

  return (
    <ol className="stepper" aria-live="polite">
      {steps.map((step) => (
        <li key={step.label} className="stepper-item is-done">
          <span className="stepper-marker">
            <CheckIcon size={10} />
          </span>
          <div className="stepper-text">
            <span className="label">{step.label}</span>
            <span className="stepper-detail">{step.detail}</span>
          </div>
        </li>
      ))}
      <li className="stepper-item is-active">
        <span className="stepper-marker">
          <Spinner size={12} />
        </span>
        <div className="stepper-text">
          <span className="label">Verifying</span>
          <span className="stepper-detail">Replaying interaction...</span>
          <span className="progress-track" aria-hidden="true">
            <span className="progress-bar" />
          </span>
        </div>
      </li>
    </ol>
  );
}

const OUTCOME_COPY: Record<VerificationOutcome, { title: string; text: string }> = {
  reproduced: { title: 'Reproduced', text: 'Same failure signature observed.' },
  not_reproduced: { title: 'Not reproduced', text: 'Replay completed without the original failure.' },
  diverged: { title: 'Diverged', text: 'Replay hit a different failure than the original.' },
  inconclusive: { title: 'Inconclusive', text: 'Replay could not complete, so the failure is unconfirmed.' },
};

function requestSignature(network?: NetworkFailure) {
  return network && requestLine(network);
}

function statusSignature(network?: NetworkFailure) {
  return network && `${network.status} ${statusText(network)}`.trim();
}

function errorSignature(error?: RuntimeError) {
  return error && formatError(error);
}

function VerificationResultView({ incident, result }: { incident: Incident; result: VerificationResult }) {
  const reproduced = result.outcome === 'reproduced';
  const copy = OUTCOME_COPY[result.outcome];
  const rows = [
    { label: 'Request', original: requestSignature(incident.network), replay: requestSignature(result.network) },
    { label: 'Status', original: statusSignature(incident.network), replay: statusSignature(result.network) },
    { label: 'Error', original: errorSignature(incident.runtimeError), replay: errorSignature(result.runtimeError) },
  ].filter((row) => row.original || row.replay);

  return (
    <div className="stack">
      <div className={`result ${reproduced ? 'tone-success' : 'tone-warning'}`} role="status">
        <div className="result-title">
          {copy.title}
          {reproduced ? <CheckIcon size={18} /> : <AlertIcon size={18} />}
        </div>
        <p className="result-text">{result.detail ?? copy.text}</p>
      </div>

      <EvidenceCard
        label="Failure signature"
        tone={reproduced ? 'success' : 'warning'}
        aside={<SourceTag kind="replay" />}
      >
        {reproduced ? (
          <ul className="match-list">
            {rows.map((row) => (
              <li key={row.label}>
                <CheckIcon size={11} className="match-icon" />
                <span className="match-label">{row.label}</span>
                <code>{row.replay}</code>
              </li>
            ))}
          </ul>
        ) : (
          <dl className="compare-list">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <span className="compare-kind">original</span>
                  <code>{row.original ?? '—'}</code>
                </dd>
                <dd>
                  <span className="compare-kind">replay</span>
                  <code>{row.replay ?? '—'}</code>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </EvidenceCard>
    </div>
  );
}
