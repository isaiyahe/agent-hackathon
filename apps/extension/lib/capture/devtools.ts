import { browser, type Browser } from 'wxt/browser';
import { collectPageActions, type PageSnapshot } from './collector';
import { ACTION_BUFFER_SIZE, type FinishedRequest } from './incident';

/** The inspected tab as the panel sees it. A fake stands in for it in tests. */
export interface InspectedPage {
  /** Installs the click collector if needed (from scratch when `reset`) and drains its queue. */
  drain(reset: boolean): Promise<PageSnapshot>;
  onRequestFinished(listener: (request: FinishedRequest) => void): () => void;
  onNavigated(listener: (url: string) => void): () => void;
}

/** False in the standalone preview tab, where no chrome.devtools API exists. */
export function isDevToolsPanel(): boolean {
  return Boolean(browser?.devtools?.inspectedWindow);
}

const collectorSource = collectPageActions.toString();

/** chrome.devtools-backed InspectedPage: no content script, background worker, or host permissions. */
export function connectInspectedPage(): InspectedPage {
  const { inspectedWindow, network } = browser.devtools;

  return {
    drain(reset) {
      const expression = `(${collectorSource})(${reset}, ${ACTION_BUFFER_SIZE})`;
      return new Promise((resolve, reject) => {
        inspectedWindow.eval<PageSnapshot>(expression, (result, exception) => {
          if (exception) reject(new Error(exception.isException ? exception.value : exception.description));
          else resolve(result);
        });
      });
    },

    onRequestFinished(listener) {
      // Reads method, URL, and status only. Never getContent(), headers, or cookies.
      const onFinished = ({ request, response }: Browser.devtools.network.Request) =>
        listener({ method: request.method, url: request.url, status: response.status, statusText: response.statusText });
      network.onRequestFinished.addListener(onFinished);
      return () => network.onRequestFinished.removeListener(onFinished);
    },

    onNavigated(listener) {
      network.onNavigated.addListener(listener);
      return () => network.onNavigated.removeListener(listener);
    },
  };
}
