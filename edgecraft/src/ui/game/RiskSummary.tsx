import { useMemo, useState } from 'react';
import { levelCfg, type GameState } from '../../engine/game';
import { FACTORS } from '../../engine/market';
import { STRESS_SCENARIOS, deskParams, factorExposures, stressPnl } from '../../engine/risk';
import { Bar, Panel, useDebounced } from '../kit';
import { money, pct, signedMoney, toneClass } from '../format';
import { themeFor } from './themes';
import type { Desk } from './useDesk';

/**
 * Risk in plain dollars: how much a normal / bad / terrible week costs, where
 * those losses come from, what the book is really betting on, and what a
 * crisis would do. Everything comes from the desk's joint scenarios.
 */
export function RiskSummary({ state, desk, targets }: { state: GameState; desk: Desk; targets: Record<string, number> }) {
  const t = useDebounced(targets, 150);
  const [showAllStress, setShowAllStress] = useState(false);
  const nav = state.nav;
  const lvl = levelCfg(state);
  const r = useMemo(() => {
    const { sc } = desk;
    const ids = desk.universe;
    const held = ids.map((id, i) => ({ id, i, n: t[id] ?? 0 })).filter((x) => x.n);
    const S = sc.S;
    const pnl = new Float64Array(S);
    for (let s = 0; s < S; s++) {
      let x = 0;
      for (const h of held) x += h.n * sc.R[s * sc.N + h.i];
      pnl[s] = x;
    }
    const order = Array.from({ length: S }, (_, s) => s).sort((a, b) => pnl[a] - pnl[b]);
    const q = (p: number) => pnl[order[Math.min(S - 1, Math.floor(p * S))]];
    let mean = 0;
    for (let s = 0; s < S; s++) mean += pnl[s];
    mean /= S;
    let v = 0;
    for (let s = 0; s < S; s++) v += (pnl[s] - mean) ** 2;
    const sd = Math.sqrt(v / (S - 1));
    // where the bad weeks come from: each position's average P&L in the worst 5% of scenarios
    const tail = order.slice(0, Math.max(1, Math.floor(S * 0.05)));
    const tailLoss = tail.reduce((a, s) => a + pnl[s], 0) / tail.length;
    const contrib = held
      .map((h) => ({ id: h.id, v: tail.reduce((a, s) => a + h.n * sc.R[s * sc.N + h.i], 0) / tail.length }))
      .sort((a, b) => a.v - b.v);
    // drawdown trigger
    const trigger = state.peak * (1 - lvl.ddDerisk);
    const room = nav - trigger;
    let hit = 0;
    for (let s = 0; s < S; s++) if (pnl[s] <= -room) hit++;
    // themes
    const insts = held.map((h) => state.instruments[h.id]);
    const fx = factorExposures(insts, held.map((h) => h.n));
    // re-price the whole book under a sharp (2.5σ) move against each exposure, so convex payoffs show their tails
    const params = insts.map(deskParams);
    const notionals = held.map((h) => h.n);
    const themes = FACTORS.map((f) => {
      const e = fx[f];
      const shocked = stressPnl(insts, notionals, params, { [f]: e >= 0 ? -2.5 : 2.5 }).total;
      const base = stressPnl(insts, notionals, params, {}).total;
      return { f, e, loss: Math.max(0, base - shocked) };
    })
      .filter((x) => Math.abs(x.e) >= 0.0002 * nav && x.loss >= 0.0005 * nav)
      .sort((a, b) => b.loss - a.loss);
    const stress = STRESS_SCENARIOS.map((z) => ({ z, ...stressPnl(insts, notionals, params, z.Z) })).sort((a, b) => a.total - b.total);
    return { held: held.length, mean, sd, p05: q(0.05), p01: q(0.01), worst: pnl[order[0]], tailLoss, contrib, room, pHit: hit / S, themes, stress, insts };
  }, [desk, t, state, nav, lvl.ddDerisk]);

  if (!r.held) {
    return (
      <Panel title="Your risk">
        <p className="text-[13px] text-ink2">You're all in cash: nothing can go wrong this week, and you earn {state.tape.rf.toFixed(1)}% a year. Add trades in the blotter and this panel shows, in dollars, what you could lose and why.</p>
      </Panel>
    );
  }

  const annVol = (r.sd / nav) * Math.sqrt(52);
  const level = annVol < 0.05 ? ['Low', 'var(--pos-fill)'] : annVol < 0.12 ? ['Moderate', 'var(--c1)'] : annVol < 0.25 ? ['High', 'var(--warn)'] : ['Very high', 'var(--neg-fill)'];
  const maxBar = Math.max(1, -r.p01, ...r.themes.map((x) => x.loss), ...r.stress.map((x) => -x.total));
  const stressShown = showAllStress ? r.stress : r.stress.slice(0, 3);

  return (
    <Panel title="Your risk this week" right={<span className="chip" style={{ color: level[1], borderColor: 'currentColor' }}>{level[0]} risk · {pct(annVol, 0)}/yr vol</span>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Loss label="Normal week" sub="2 in 3 weeks within" value={`±${money(r.sd)}`} />
          <Loss label="Bad week" sub="1 in 20" value={signedMoney(r.p05)} tone="text-neg" />
          <Loss label="Terrible week" sub="1 in 100" value={signedMoney(r.p01)} tone="text-neg" />
        </div>
        <div className="text-[12px] text-ink2 leading-relaxed">
          You expect to make <b className={`num ${toneClass(r.mean)}`}>{signedMoney(r.mean)}</b> a week on average. Your de-risk trigger is <b className="num text-ink">{money(Math.max(0, r.room))}</b> away
          {r.pHit > 0.0005 ? <> — about a <b className="num text-ink">{pct(r.pHit, r.pHit < 0.01 ? 1 : 0)}</b> chance of hitting it in a single week.</> : <> — very unlikely to be hit in one week.</>}
        </div>

        <div>
          <div className="label mb-1.5">In a bad week, losses come from</div>
          <div className="space-y-1.5">
            {r.contrib.slice(0, 5).map((c) => (
              <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_90px_64px] gap-2 items-center text-[12px]">
                <span className="truncate text-ink2">{state.instruments[c.id].name}</span>
                <Bar value={c.v} max={maxBar} center tone={c.v < 0 ? 'var(--neg-fill)' : 'var(--pos-fill)'} />
                <span className={`num text-right ${toneClass(c.v)}`}>{signedMoney(c.v)}</span>
              </div>
            ))}
          </div>
          <div className="text-[10.5px] text-muted mt-1">Average result of each position across the worst 5% of weeks (total {signedMoney(r.tailLoss)}). A positive number means that position cushions you when the rest of the book is losing.</div>
        </div>

        {r.themes.length > 0 && (
          <div>
            <div className="label mb-1.5 flex justify-between"><span>What you're really betting on</span><span className="normal-case tracking-normal font-normal">loss if it goes sharply wrong</span></div>
            <div className="space-y-1.5">
              {r.themes.slice(0, 5).map((x) => {
                const th = themeFor(x.f, x.e);
                return (
                  <div key={x.f} className="text-[12px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-ink">Betting on <b>{th.bet}</b></span>
                      <span className="num text-neg shrink-0">−{money(x.loss)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] text-muted flex-1">if wrong: {th.risk.toLowerCase()}</span>
                      <div className="w-[90px]"><Bar value={x.loss} max={maxBar} tone="var(--neg-fill)" /></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10.5px] text-muted mt-1">A sharp move here is a 2.5σ week, roughly 1 in 150. Based on the desk's measured exposures — hidden ones won't show here until they bite.</div>
          </div>
        )}

        <div>
          <div className="label mb-1.5">If a past crisis happened tomorrow</div>
          <div className="space-y-1.5">
            {stressShown.map((x) => (
              <div key={x.z.id} className="grid grid-cols-[minmax(0,1fr)_90px_64px] gap-2 items-center text-[12px]" title={x.z.desc}>
                <span className="truncate text-ink2">{x.z.name}</span>
                <Bar value={x.total} max={maxBar} center tone={x.total < 0 ? 'var(--neg-fill)' : 'var(--pos-fill)'} />
                <span className={`num text-right ${toneClass(x.total)}`}>{signedMoney(x.total)}</span>
              </div>
            ))}
          </div>
          <button className="text-[11px] text-accent mt-1" onClick={() => setShowAllStress(!showAllStress)}>{showAllStress ? 'Show fewer' : `Show all ${r.stress.length} scenarios`}</button>
        </div>
      </div>
    </Panel>
  );
}

function Loss({ label, sub, value, tone }: { label: string; sub: string; value: string; tone?: string }) {
  return (
    <div className="bg-panel2 rounded-md px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`num text-[15px] font-semibold ${tone ?? ''}`}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}
