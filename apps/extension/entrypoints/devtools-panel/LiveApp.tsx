import { useEffect, useRef, useState } from 'react';
import { ReproPanel } from '../../components/ReproPanel';
import { connectInspectedPage } from '../../lib/capture/devtools';
import { startLiveCapture, type LiveCapture, type LiveCaptureState } from '../../lib/capture/session';

/** The REPRO panel driven by real clicks and network traffic from the inspected tab. */
export function LiveApp() {
  const [capture, setCapture] = useState<LiveCaptureState>({ state: 'watching', actions: [] });
  const [notice, setNotice] = useState<string>();
  const session = useRef<LiveCapture>(null);

  useEffect(() => {
    const live = startLiveCapture(connectInspectedPage(), setCapture);
    session.current = live;
    return live.stop;
  }, []);

  const { incident } = capture;
  useEffect(() => {
    setNotice(undefined);
    if (incident) console.info('[REPRO] Incident captured', incident);
  }, [incident]);

  return (
    <ReproPanel
      state={capture.state}
      incidentCount={incident ? 1 : 0}
      actions={capture.actions}
      incident={incident}
      notice={notice}
      onAnalyze={() => setNotice('Incident analysis is not wired up yet.')}
      onClear={() => session.current?.clear()}
    />
  );
}
