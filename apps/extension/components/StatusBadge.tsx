import type { ReactNode } from 'react';
import { Spinner } from './icons';

export type StatusTone = 'live' | 'danger' | 'info' | 'progress' | 'success' | 'warning';

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status-badge tone-${tone}`} role="status">
      {tone === 'progress' ? <Spinner size={10} /> : <span className="status-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
