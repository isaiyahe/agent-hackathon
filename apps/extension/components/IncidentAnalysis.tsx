import { displayEndpoint, formatError, pluralize } from '../lib/format';
import type { Incident, IncidentAnalysis as AnalysisData } from '../lib/types';
import { EvidenceCard, SourceTag } from './EvidenceCard';

const CONFIDENCE_BARS = { low: 1, medium: 2, high: 3 } as const;

type IncidentAnalysisProps = {
  incident: Incident;
  analysis: AnalysisData;
};

export function IncidentAnalysis({ incident, analysis }: IncidentAnalysisProps) {
  const { network, runtimeError } = incident;
  const evidence = [
    pluralize(incident.actions.length, 'user action'),
    network && '1 failed network request',
    runtimeError && '1 runtime error',
  ].filter((item): item is string => Boolean(item));
  const bars = CONFIDENCE_BARS[analysis.confidence];

  return (
    <div className="stack">
      {analysis.title && <h2 className="analysis-title">{analysis.title}</h2>}
      <div className="grid-2">
        <EvidenceCard label="Observed failure" tone="danger" aside={<SourceTag kind="captured" />}>
          {network && (
            <code className="observed-line" title={network.endpoint}>
              <span className="method">{network.method}</span> {displayEndpoint(network.endpoint)}
              <span className="arrow"> → </span>
              <span className="status-code">{network.status}</span>
            </code>
          )}
          {runtimeError && <code className="observed-error">{formatError(runtimeError)}</code>}
        </EvidenceCard>

        <EvidenceCard label="Reproduction steps" aside={<SourceTag kind="inferred" />}>
          <ol className="steps">
            {analysis.reproductionSteps.map((step, index) => (
              <li key={`${index}-${step}`}>
                <span className="step-index">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </EvidenceCard>

        <EvidenceCard label="Probable cause" aside={<SourceTag kind="inferred" />}>
          <p className="hypothesis">“{analysis.hypothesis}”</p>
          <div className={`confidence confidence-${analysis.confidence}`}>
            <span className="confidence-label">Confidence</span>
            <span className="meter" aria-hidden="true">
              {[1, 2, 3].map((bar) => (
                <i key={bar} className={bar <= bars ? 'is-on' : undefined} />
              ))}
            </span>
            <span className="confidence-value">{analysis.confidence}</span>
          </div>
        </EvidenceCard>

        <EvidenceCard label="Evidence" aside={<SourceTag kind="captured" />}>
          <ul className="evidence-list">
            {evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {analysis.evidenceGaps && analysis.evidenceGaps.length > 0 && (
            <ul className="evidence-list is-gaps">
              {analysis.evidenceGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
        </EvidenceCard>
      </div>
    </div>
  );
}
