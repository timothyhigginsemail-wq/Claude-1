import { SHADOW_INFO, type AllocState, type RoundRecord, type ShadowId } from '../../engine/allocator';
import { REGIME_SPECS } from '../../engine/market';
import { Bar, Modal } from '../kit';
import { money, pct, signedMoney, signedPct, toneClass } from '../format';
import { attribute } from './attribution';

export function RoundReport({ record: r, state, onClose }: { record: RoundRecord; state: AllocState; onClose: () => void }) {
  const a = attribute(r);
  const d = r.navAfter - r.navBefore;
  const exp = r.expected / r.navBefore;
  const regimes = [...new Set(r.regimes)].map((x) => REGIME_SPECS[x].name);
  const parts: [string, number, string][] = [
    ['Every PM at equal risk', a.base, 'What a passive allocator would have earned from the whole pool'],
    ['Your selection', a.selection, 'Your chosen PMs at equal risk, vs the whole pool'],
    ['Your sizing', a.sizing, 'Your risk budgets vs equal risk across your PMs'],
    ['Your stops', a.stops, 'Your result vs the same allocations with no stops'],
  ];
  const max = Math.max(0.001, ...parts.map(([, v]) => Math.abs(v)), Math.abs(a.you));
  const rows = r.pms.slice().sort((x, y) => x.pnl - y.pnl);
  return (
    <Modal open wide onClose={onClose} title={<span>Weeks {r.fromWeek + 1}–{r.toWeek} · <span className={`num ${toneClass(d)}`}>{signedMoney(d)} ({signedPct(a.you, 2)})</span></span>} footer={<button className="btn btn-primary" onClick={onClose}>Back to the allocation meeting</button>}>
      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <div className="label mb-2">Where your result came from</div>
          <div className="space-y-1.5 text-[12.5px]">
            {parts.map(([l, v, tip]) => (
              <div key={l} className="grid grid-cols-[170px_minmax(0,1fr)_70px] items-center gap-2" title={tip}>
                <span className="text-ink2">{l}</span>
                <Bar value={v} max={max} center tone={v >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} height={9} />
                <span className={`num text-right ${toneClass(v)}`}>{signedPct(v, 2)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[170px_minmax(0,1fr)_70px] items-center gap-2 border-t border-line pt-1.5 font-semibold">
              <span>You</span>
              <Bar value={a.you} max={max} center tone={a.you >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} height={9} />
              <span className={`num text-right ${toneClass(a.you)}`}>{signedPct(a.you, 2)}</span>
            </div>
          </div>
          <div className="text-[12px] text-ink2 mt-3 leading-relaxed space-y-1.5">
            <p>Expected excess return for this stretch (from your estimates): <b className="num text-ink">{signedPct(exp, 2)}</b>. Market: {regimes.join(' → ')}.</p>
            <p>{Math.abs(a.stops) > 0.002 ? (a.stops > 0 ? 'Your stops saved money this time — check later whether the PMs you cut recovered.' : 'Your stops cost money: PMs were cut and then (or before) recovered. Tight stops relative to a PM\'s volatility turn noise into realised losses.') : 'Stops made little difference this round.'}</p>
            <p className="text-muted text-[11px]">One stretch of 4–8 weeks is mostly luck. The attribution becomes meaningful across many rounds — see the history panel.</p>
          </div>
          {r.events.length > 0 && (
            <div className="mt-3 space-y-1">
              {r.events.map((e, i) => <div key={i} className={`text-[12px] ${e.includes('stop') || e.includes('risk committee') ? 'text-neg' : 'text-ink2'}`}>• {e}</div>)}
            </div>
          )}
        </div>
        <div>
          <div className="label mb-2">PM results</div>
          <table className="w-full text-[12px]">
            <thead className="text-muted text-left"><tr><th className="py-1 font-medium">PM</th><th className="font-medium text-right">Capital</th><th className="font-medium text-right">P&L</th><th className="font-medium text-right">Return</th><th className="font-medium text-right">Payout</th></tr></thead>
            <tbody>
              {rows.map((x) => {
                const pm = state.pms[x.id];
                return (
                  <tr key={x.id} className="border-t border-line">
                    <td className="py-1.5">{pm.name}<div className="text-[10.5px] text-muted">{pm.style}{x.stopped ? <span className="text-neg"> · stopped week {(x.stoppedWeek ?? 0) + 1}</span> : ''}</div></td>
                    <td className="num text-right">{money(x.start)}</td>
                    <td className={`num text-right ${toneClass(x.pnl)}`}>{signedMoney(x.pnl)}</td>
                    <td className={`num text-right ${toneClass(x.pnl)}`}>{signedPct(x.pnl / x.start, 1)}</td>
                    <td className="num text-right text-muted">{x.fee ? money(x.fee) : '—'}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={5} className="py-2 text-muted">No PMs were funded.</td></tr>}
            </tbody>
          </table>
          <div className="text-[11.5px] text-ink2 mt-2">Payouts this round: <b className="num">{money(r.fees)}</b> · reallocation costs <b className="num">{money(r.costs)}</b>. Payouts are made yearly and when a PM leaves.</div>
          <div className="label mt-4 mb-1">Counterfactual books this round</div>
          <table className="w-full text-[12px]">
            <tbody>
              {(Object.keys(SHADOW_INFO) as ShadowId[]).map((k) => {
                const x = r.shadows[k];
                const ret = x.after / x.before - 1;
                return <tr key={k} className="border-t border-line" title={SHADOW_INFO[k].desc}><td className="py-1.5 text-ink2">{SHADOW_INFO[k].name}<div className="text-[10.5px] text-muted">{SHADOW_INFO[k].tests}</div></td><td className={`num text-right ${toneClass(ret)}`}>{signedPct(ret, 2)}</td></tr>;
              })}
            </tbody>
          </table>
          <div className="text-[10.5px] text-muted mt-1">Each is re-based to its own NAV every round; same market, same PM returns. Drawdown now {pct(1 - r.navAfter / state.peak, 1)} from peak.</div>
        </div>
      </div>
    </Modal>
  );
}
