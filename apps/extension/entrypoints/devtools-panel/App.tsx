import { useEffect, useMemo, useRef, useState } from 'react';
import { DevStateBar } from '../../components/DevStateBar';
import { ReproPanel } from '../../components/ReproPanel';
import { createMockActions, createMockIncident, createMockVerification, mockAnalysis } from '../../lib/mock';
import type { ActionEvent, ReproState } from '../../lib/types';

/**
 * Mock driver for the REPRO panel.
 *
 * Everything here is temporary: swap this local state for the real capture /
 * analysis / replay output. <ReproPanel /> only needs the props passed below.
 */

const STATES: readonly ReproState[] = ['watching', 'recording', 'failure', 'analysis', 'verifying', 'verified'];

const ACTION_INTERVAL_MS = 1300;
const ANALYZE_DELAY_MS = 900;
const VERIFY_DELAY_MS = 2600;

// Preview-only URL params: ?state=failure jumps to a state; ?runtimeError=0 drops the
// runtime error from the mock incident (the live demo currently fails with only a 500).
const params = new URLSearchParams(window.location.search);
const MOCK_RUNTIME_ERROR = params.get('runtimeError') !== '0';

function stateFromUrl(): ReproState {
  const requested = params.get('state');
  return STATES.find((state) => state === requested) ?? 'watching';
}

export default function App() {
  const [state, setState] = useState<ReproState>(stateFromUrl);
  const [actions, setActions] = useState<ActionEvent[]>(() => createMockActions());
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [showDevBar, setShowDevBar] = useState(true);
  const timers = useRef<number[]>([]);

  const incident = useMemo(() => {
    const mock = createMockIncident(actions);
    return MOCK_RUNTIME_ERROR ? mock : { ...mock, runtimeError: undefined };
  }, [actions]);
  const verification = useMemo(() => createMockVerification(incident), [incident]);

  function later(ms: number, callback: () => void) {
    timers.current.push(window.setTimeout(callback, ms));
  }

  function goTo(next: ReproState) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setAnalyzing(false);
    setNotice(undefined);
    setState(next);
  }

  function selectState(next: ReproState) {
    setActions(createMockActions());
    goTo(next);
  }

  /** Simulates the capture layer: actions trickle in, then the checkout request fails. */
  function playFlow() {
    goTo('watching');
    setActions([]);
    const script = createMockActions();
    script.forEach((action, index) => {
      later((index + 1) * ACTION_INTERVAL_MS, () => {
        setActions((current) => [...current, { ...action, timestamp: Date.now() }]);
        setState('recording');
      });
    });
    later((script.length + 1) * ACTION_INTERVAL_MS, () => setState('failure'));
  }

  function handleAnalyze() {
    setAnalyzing(true);
    later(ANALYZE_DELAY_MS, () => {
      setAnalyzing(false);
      setState('analysis');
    });
  }

  function handleVerify() {
    goTo('verifying');
    later(VERIFY_DELAY_MS, () => setState('verified'));
  }

  function handleCreateIssue() {
    console.info('[REPRO] onCreateIssue() placeholder', { incident, analysis: mockAnalysis, verification });
    setNotice('Placeholder: GitHub issue creation is not wired up yet.');
  }

  // Keyboard shortcuts: 1–6 select a state, P plays the mock flow, D toggles the mock bar.
  const shortcuts = useRef({ selectState, playFlow });
  shortcuts.current = { selectState, playFlow };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = STATES[Number(event.key) - 1];
      if (target) shortcuts.current.selectState(target);
      else if (event.key === 'p') shortcuts.current.playFlow();
      else if (event.key === 'd') setShowDevBar((visible) => !visible);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const hasIncident = state !== 'watching' && state !== 'recording';

  return (
    <>
      {showDevBar && (
        <DevStateBar
          states={STATES}
          current={state}
          onSelect={selectState}
          onPlay={playFlow}
          onHide={() => setShowDevBar(false)}
        />
      )}
      <ReproPanel
        state={state}
        incidentCount={hasIncident ? 1 : 0}
        actions={state === 'watching' ? [] : actions}
        incident={hasIncident ? incident : undefined}
        analysis={hasIncident && state !== 'failure' ? mockAnalysis : undefined}
        verification={state === 'verified' ? verification : undefined}
        analyzing={analyzing}
        notice={notice}
        onAnalyze={handleAnalyze}
        onVerify={handleVerify}
        onCreateIssue={handleCreateIssue}
        onClear={() => selectState('watching')}
      />
    </>
  );
}
