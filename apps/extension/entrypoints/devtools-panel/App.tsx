import { isDevToolsPanel } from '../../lib/capture/devtools';
import { LiveApp } from './LiveApp';
import { MockApp } from './MockApp';

// Real browser capture is the default. ?mock=1 swaps in the mock state driver, which only
// matters for the standalone preview (npm run panel): the DevTools panel URL has no query.
const MOCK = new URLSearchParams(window.location.search).get('mock') === '1';

export default function App() {
  if (MOCK) return <MockApp />;
  if (!isDevToolsPanel()) {
    return (
      <div className="panel">
        <main className="panel-body">
          <p className="hint">Open REPRO from Chrome DevTools to capture this tab, or add ?mock=1 to preview mock states.</p>
        </main>
      </div>
    );
  }
  return <LiveApp />;
}
