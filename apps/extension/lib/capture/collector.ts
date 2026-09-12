import type { ActionEvent, PageInfo } from '../types';

/** One drain of the inspected page. */
export type PageSnapshot = {
  /** Clicks since the previous drain, oldest first. The panel assigns ids. */
  clicks: Omit<ActionEvent, 'id'>[];
  page: PageInfo;
};

/**
 * Runs INSIDE the inspected page via chrome.devtools.inspectedWindow.eval. It is
 * serialized with Function#toString, so it must stay self-contained: no imports and
 * no references to anything outside its own body.
 *
 * Installs one capture-phase click listener (again after a reload, or from scratch
 * when `reset` is set) and returns the clicks queued since the last call. Only the
 * clicked control's visible label and a selector are recorded: never input values,
 * cookies, or page HTML.
 */
export function collectPageActions(reset: boolean, limit: number): PageSnapshot {
  type Click = PageSnapshot['clicks'][number];
  type Collector = { queue: Click[]; dispose: () => void };

  const key = Symbol.for('repro.actionCollector');
  const registry = window as unknown as Record<symbol, Collector | undefined>;
  if (reset) {
    registry[key]?.dispose();
    delete registry[key];
  }

  let collector = registry[key];
  if (!collector) {
    const queue: Click[] = [];
    const onClick = (event: MouseEvent) => {
      const control =
        event.target instanceof Element
          ? event.target.closest(
              'button, a[href], [role="button"], input[type="button"], input[type="submit"], input[type="reset"]',
            )
          : null;
      if (!control || control.matches(':disabled')) return;

      const testId = control.getAttribute('data-testid');
      const text = control instanceof HTMLElement ? control.innerText : (control.textContent ?? '');
      const label =
        text.replace(/\s+/g, ' ').trim() ||
        control.getAttribute('aria-label') ||
        (control instanceof HTMLInputElement ? control.value : '') ||
        testId ||
        control.tagName.toLowerCase();
      const selector = testId
        ? `[data-testid="${testId.replace(/["\\]/g, '\\$&')}"]`
        : control.id
          ? `#${CSS.escape(control.id)}`
          : undefined;

      queue.push({ timestamp: Date.now(), type: 'click', label: label.slice(0, 80), selector });
      if (queue.length > limit) queue.splice(0, queue.length - limit);
    };
    window.addEventListener('click', onClick, true);
    collector = { queue, dispose: () => window.removeEventListener('click', onClick, true) };
    registry[key] = collector;
  }

  return {
    clicks: collector.queue.splice(0),
    page: { url: location.origin + location.pathname, title: document.title },
  };
}
