import type { ReactNode } from 'react';
import { formatTime, pathOf, pluralize } from '../lib/format';
import type {
  ActionEvent,
  Incident,
  IncidentAnalysis as AnalysisData,
  ReproState,
  VerificationResult,
} from '../lib/types';
import { ActionBar, ActionButton } from './ActionButton';
import { ActivityTimeline } from './ActivityTimeline';
import { ErrorSignature, EvidenceCard, EvidenceCounts, NetworkSignature } from './EvidenceCard';
import { Header } from './Header';
import { AlertIcon, GitHubIcon, LockIcon } from './icons';
import { IncidentAnalysis } from './IncidentAnalysis';
import { VerificationState } from './VerificationState';

export type ReproPanelProps = {
  state: ReproState;
  incidentCount: number;
  /** Rolling buffer of recent semantic actions (watching / recording). */
  actions: ActionEvent[];
  /** Frozen incident window (failure onward). */
  incident?: Incident;
  /** Model analysis (analysis onward). */
  analysis?: AnalysisData;
  /** Replay result (verified). */
  verification?: VerificationResult;
  /** Analyze Incident is in flight. */
  analyzing?: boolean;
  /** Create GitHub Issue is in flight. */
  creatingIssue?: boolean;
  /** Short status line under the action buttons, e.g. an issue-creation result. */
  notice?: ReactNode;
  onAnalyze?: () => void;
  onVerify?: () => void;
  onCreateIssue?: () => void;
  onClear?: () => void;
};

export function ReproPanel(props: ReproPanelProps) {
  return (
    <div className="panel">
      <Header
        state={props.state}
        outcome={props.verification?.outcome}
        incidentCount={props.incidentCount}
        onClear={props.incident ? props.onClear : undefined}
      />
      <main className="panel-body">
        <PanelContent {...props} />
      </main>
    </div>
  );
}

function PanelContent(props: ReproPanelProps) {
  const { state, actions, incident, analysis, verification, notice } = props;

  if (state === 'watching' || state === 'recording') {
    return (
      <>
        <section className="section">
          <header className="section-header">
            <h2 className="label">Recent activity</h2>
            {actions.length > 0 && <span className="section-aside">{pluralize(actions.length, 'action')} buffered</span>}
          </header>
          <ActivityTimeline actions={actions} />
        </section>
        <p className="hint">
          REPRO keeps a rolling buffer of clicks, inputs, and navigations on this tab. When a request fails or an
          uncaught error is thrown, it freezes that window as an incident.
        </p>
      </>
    );
  }

  if (!incident) {
    return <p className="hint">No incident captured.</p>;
  }

  switch (state) {
    case 'failure':
      return <FailureView {...props} incident={incident} />;

    case 'analysis':
      return (
        <>
          {analysis ? (
            <IncidentAnalysis incident={incident} analysis={analysis} />
          ) : (
            <p className="hint">Waiting for analysis…</p>
          )}
          <ActionBar hint={notice ?? 'Verify the reproduction to unlock issue creation.'}>
            <ActionButton variant="primary" onClick={props.onVerify}>
              Verify Reproduction
            </ActionButton>
            <ActionButton icon={<LockIcon />} disabled title="Available after the failure is reproduced">
              Create GitHub Issue
            </ActionButton>
          </ActionBar>
        </>
      );

    case 'verifying':
      return (
        <>
          <VerificationState incident={incident} analysis={analysis} />
          <ActionBar hint={notice ?? 'Issue creation unlocks once the same failure is observed again.'}>
            <ActionButton variant="primary" loading>
              Verifying…
            </ActionButton>
            <ActionButton icon={<LockIcon />} disabled title="Available after the failure is reproduced">
              Create GitHub Issue
            </ActionButton>
          </ActionBar>
        </>
      );

    case 'verified': {
      const reproduced = verification?.outcome === 'reproduced';
      return (
        <>
          {verification ? (
            <VerificationState incident={incident} analysis={analysis} result={verification} />
          ) : (
            <p className="hint">No verification result.</p>
          )}
          <ActionBar hint={notice ?? (reproduced ? undefined : 'Issue creation requires a reproduced failure.')}>
            <ActionButton
              variant="primary"
              icon={reproduced ? <GitHubIcon /> : <LockIcon />}
              disabled={!reproduced}
              loading={props.creatingIssue}
              onClick={props.onCreateIssue}
            >
              Create GitHub Issue
            </ActionButton>
            <ActionButton onClick={props.onVerify}>Re-run Verification</ActionButton>
          </ActionBar>
        </>
      );
    }
  }
}

function FailureView({ incident, analyzing, notice, onAnalyze }: ReproPanelProps & { incident: Incident }) {
  const meta = [
    `Incident ${incident.id}`,
    incident.page.url && pathOf(incident.page.url),
    formatTime(incident.timestamp),
  ].filter(Boolean);

  return (
    <>
      <div className="alert tone-danger" role="alert">
        <AlertIcon size={16} />
        <div>
          <div className="alert-title">Failure detected</div>
          <div className="alert-meta">{meta.join(' · ')}</div>
        </div>
      </div>

      <div className="failure-grid">
        {incident.network && (
          <EvidenceCard label="Failed request" tone="danger" className="area-network">
            <NetworkSignature network={incident.network} />
          </EvidenceCard>
        )}
        <EvidenceCard label="Captured evidence" className="area-counts">
          <EvidenceCounts incident={incident} />
        </EvidenceCard>
        <EvidenceCard label="Timeline" className="area-timeline">
          <ActivityTimeline actions={incident.actions} network={incident.network} numbered />
        </EvidenceCard>
        {incident.runtimeError && (
          <EvidenceCard label="Runtime error" tone="danger" className="area-error">
            <ErrorSignature error={incident.runtimeError} />
          </EvidenceCard>
        )}
      </div>

      <ActionBar hint={notice}>
        <ActionButton variant="primary" loading={analyzing} onClick={onAnalyze}>
          {analyzing ? 'Analyzing…' : 'Analyze Incident'}
        </ActionButton>
      </ActionBar>
    </>
  );
}
