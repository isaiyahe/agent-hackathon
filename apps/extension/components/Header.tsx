import { pluralize } from '../lib/format';
import type { ReproState, VerificationOutcome } from '../lib/types';
import { CheckIcon, ClearIcon, LogoMark } from './icons';
import { StatusBadge, type StatusTone } from './StatusBadge';

type HeaderProps = {
  state: ReproState;
  outcome?: VerificationOutcome;
  incidentCount: number;
  onClear?: () => void;
};

const PHASES = ['Witness', 'Reconstruct', 'Verify', 'Issue'] as const;

type PhaseStatus = 'done' | 'current' | 'pending' | 'blocked';

const OUTCOME_STATUS: Record<VerificationOutcome, [StatusTone, string]> = {
  reproduced: ['success', 'Reproduced'],
  not_reproduced: ['warning', 'Not reproduced'],
  diverged: ['warning', 'Diverged'],
  inconclusive: ['warning', 'Inconclusive'],
};

function statusFor(state: ReproState, outcome?: VerificationOutcome): [StatusTone, string] {
  switch (state) {
    case 'watching':
      return ['live', 'Watching this tab'];
    case 'recording':
      return ['live', 'Recording actions'];
    case 'failure':
      return ['danger', 'Failure detected'];
    case 'analysis':
      return ['info', 'Analysis ready'];
    case 'verifying':
      return ['progress', 'Verifying reproduction'];
    case 'verified':
      return outcome ? OUTCOME_STATUS[outcome] : ['warning', 'No verification result'];
  }
}

function phaseStatuses(state: ReproState, outcome?: VerificationOutcome): PhaseStatus[] {
  switch (state) {
    case 'watching':
    case 'recording':
      return ['current', 'pending', 'pending', 'pending'];
    case 'failure':
      return ['done', 'current', 'pending', 'pending'];
    case 'analysis':
    case 'verifying':
      return ['done', 'done', 'current', 'pending'];
    case 'verified':
      return outcome === 'reproduced'
        ? ['done', 'done', 'done', 'current']
        : ['done', 'done', 'blocked', 'pending'];
  }
}

export function Header({ state, outcome, incidentCount, onClear }: HeaderProps) {
  const [tone, label] = statusFor(state, outcome);
  const statuses = phaseStatuses(state, outcome);

  return (
    <header className="header">
      <div className="toolbar">
        <span className="brand">
          <LogoMark size={14} />
          REPRO
        </span>
        <span className="toolbar-divider" />
        <StatusBadge tone={tone}>{label}</StatusBadge>
        <span className="toolbar-spacer" />
        <span className="incident-count">{pluralize(incidentCount, 'incident')}</span>
        {onClear && (
          <button
            type="button"
            className="icon-button"
            onClick={onClear}
            title="Clear incident and keep watching"
            aria-label="Clear incident"
          >
            <ClearIcon size={13} />
          </button>
        )}
      </div>
      <ol className="phases" aria-label="REPRO loop">
        {PHASES.map((phase, index) => {
          const status = statuses[index] ?? 'pending';
          return (
            <li
              key={phase}
              className={`phase phase-${status}`}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              {status === 'done' ? <CheckIcon size={10} /> : <span className="phase-index">{index + 1}</span>}
              {phase}
            </li>
          );
        })}
      </ol>
    </header>
  );
}
