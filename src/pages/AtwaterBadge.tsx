import { atwater } from '../atwater';
import type { Nutrition } from '../types';
import { Icon } from '../ui';

/** A quiet, non-blocking note when calories and macros disagree. Nothing changes until "Recalculate" is tapped. */
export default function AtwaterBadge({ n, onRecalc, compact }: { n: Nutrition; onRecalc?: (kcal: number) => void; compact?: boolean }) {
  const a = atwater(n);
  if (a.ok) return null;
  const range = Math.round(a.lo) === Math.round(a.hi) ? `${Math.round(a.lo)}` : `${Math.round(a.lo)}–${Math.round(a.hi)}`;
  return (
    <div className={'atwater' + (compact ? ' compact' : '')} role="note">
      <Icon name="warn" size={compact ? 13 : 15} stroke={2.4} />
      <span style={{ flex: '1 1 calc(100% - 26px)', minWidth: 0 }}>
        Macros add up to {range} kcal; stored {Math.round(n.kcal)}.
      </span>
      {onRecalc && (
        <button type="button" className="link-btn" onClick={() => onRecalc(a.recalculated)}>
          {compact ? 'Recalculate' : 'Recalculate kcal from macros'}
        </button>
      )}
    </div>
  );
}
