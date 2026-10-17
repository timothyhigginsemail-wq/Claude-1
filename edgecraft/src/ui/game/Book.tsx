import type { GameState, OrderCheck } from '../../engine/game';
import { ARCHETYPE_INFO } from '../../engine/instruments';
import { Panel } from '../kit';
import { bp, money, mult, pct, signedMoney, toneClass } from '../format';
import type { Desk } from './useDesk';

export function BookPanel({ state, desk, targets, setTarget, onSelect, check, reset }: {
  state: GameState;
  desk: Desk;
  targets: Record<string, number>;
  setTarget: (id: string, n: number) => void;
  onSelect: (id: string) => void;
  check: OrderCheck;
  reset: () => void;
}) {
  const ids = [...new Set([...Object.keys(state.positions), ...Object.keys(targets).filter((id) => targets[id])])].filter((id) => state.instruments[id]);
  const nav = state.nav;
  return (
    <Panel
      title="Portfolio book & orders"
      right={
        <>
          <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={reset}>Reset orders</button>
          <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={() => ids.forEach((id) => setTarget(id, 0))}>Close all</button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        <Kpi label="Positions" value={`${check.positions}`} />
        <Kpi label="Gross" value={mult(check.gross / nav)} sub={money(check.gross)} warn={check.gross > check.maxGross * nav} />
        <Kpi label="Net" value={mult(check.net / nav)} sub={money(check.net)} />
        <Kpi label="Margin used" value={pct(check.margin / nav, 0)} sub={money(check.margin)} warn={check.margin > 0.75 * nav} />
        <Kpi label="Trading cost" value={money(check.tradeCost)} sub={bp(check.tradeCost / nav, 1) + ' of NAV'} />
      </div>
      {check.warnings.map((w) => <div key={w} className="text-[12px] text-warn mb-1">⚠ {w}</div>)}
      {ids.length === 0 ? (
        <div className="text-muted text-[12.5px] py-3">No positions. Holding cash earns {state.tape.rf.toFixed(2)}% a year. Select an opportunity to size a trade.</div>
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-[12px]">
            <thead className="text-muted text-left">
              <tr>
                <th className="py-1 pr-2 font-medium">Instrument</th>
                <th className="pr-2 font-medium text-right">Held</th>
                <th className="pr-2 font-medium text-right">Order → target</th>
                <th className="pr-2 font-medium text-right">EV / turn</th>
                <th className="pr-2 font-medium text-right">P&L to date</th>
                <th className="pr-2 font-medium text-right">Left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const p = state.instruments[id];
                const pos = state.positions[id];
                const held = pos?.notional ?? 0;
                const tgt = targets[id] ?? held;
                const q = desk.quotes[id];
                const changed = Math.abs(tgt - held) >= 1;
                return (
                  <tr key={id} className="border-t border-line hover:bg-panel2 cursor-pointer" onClick={() => onSelect(id)}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium truncate max-w-[220px]">{p.name}</div>
                      <div className="text-[10.5px]" style={{ color: ARCHETYPE_INFO[p.archetype].color }}>{ARCHETYPE_INFO[p.archetype].short}</div>
                    </td>
                    <td className="pr-2 num text-right">{held ? money(held) : '—'}</td>
                    <td className={`pr-2 num text-right ${changed ? 'text-warn font-semibold' : 'text-muted'}`}>
                      {changed ? `${tgt === 0 ? 'close' : money(tgt)}` : 'hold'}
                      <div className="text-[10.5px] text-muted font-normal">{pct(tgt / nav, 1)} NAV</div>
                    </td>
                    <td className={`pr-2 num text-right ${toneClass(q ? tgt * q.ev : 0)}`}>{q ? signedMoney(tgt * q.ev) : '—'}</td>
                    <td className={`pr-2 num text-right ${toneClass(pos?.pnl ?? 0)}`}>{pos ? signedMoney(pos.pnl) : '—'}</td>
                    <td className="pr-2 num text-right text-muted">{p.expiresTurn > 1e8 ? '∞' : p.expiresTurn - state.turn + 1}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {tgt !== 0 && <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={() => setTarget(id, 0)}>Close</button>}
                      {changed && <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={() => setTarget(id, held)}>Undo</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10.5px] text-muted mt-2 leading-snug">
        Exposures are held at their dollar notional until you resize them (so a losing book drifts toward higher leverage). Funded legs above NAV are financed at the cash rate plus the funding spread ({(state.indicators.FUND).toFixed(0)}bp).
      </div>
    </Panel>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="label text-[9.5px]">{label}</div>
      <div className={`num text-[14px] font-semibold ${warn ? 'text-neg' : ''}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted num">{sub}</div>}
    </div>
  );
}
