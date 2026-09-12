import type { ReproState } from '../lib/types';
import { PlayIcon } from './icons';

type DevStateBarProps = {
  states: readonly ReproState[];
  current: ReproState;
  onSelect: (state: ReproState) => void;
  onPlay: () => void;
  onHide: () => void;
};

/** Temporary mock-state switcher for development. Not part of the product UI. */
export function DevStateBar({ states, current, onSelect, onPlay, onHide }: DevStateBarProps) {
  return (
    <div className="devbar" role="toolbar" aria-label="Mock state switcher">
      <span className="devbar-tag">Mock</span>
      <div className="devbar-states">
        {states.map((state, index) => (
          <button
            key={state}
            type="button"
            className={state === current ? 'devbar-button is-active' : 'devbar-button'}
            onClick={() => onSelect(state)}
            title={`Shortcut: ${index + 1}`}
          >
            <kbd>{index + 1}</kbd>
            {state}
          </button>
        ))}
      </div>
      <span className="toolbar-spacer" />
      <button type="button" className="devbar-button" onClick={onPlay} title="Shortcut: P">
        <PlayIcon size={9} />
        play flow
      </button>
      <button type="button" className="devbar-button" onClick={onHide} title="Shortcut: D">
        hide
      </button>
    </div>
  );
}
