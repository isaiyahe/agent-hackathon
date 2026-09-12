import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './icons';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  loading?: boolean;
};

export function ActionButton({
  variant = 'secondary',
  icon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** Row of state actions pinned to the bottom of the panel when content overflows. */
export function ActionBar({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="action-bar">
      <div className="action-bar-buttons">{children}</div>
      {hint && <p className="action-bar-hint">{hint}</p>}
    </div>
  );
}
