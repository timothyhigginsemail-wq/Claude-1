import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/game';
import { kellyDiscrete } from '../../engine/kelly';
import { FACTORS, FACTOR_INFO } from '../../engine/market';
import { STRESS_SCENARIOS, deskParams, stressPnl } from '../../engine/risk';
import { Bar, Info, Panel, Tabs } from '../kit';
import { annualFromWeeklyLog, money, mult, num, pct, signedMoney, signedPct, toneClass } from '../format';
import { divergingColor } from '../charts';
import type { WhyTopic } from '../content';
import type { Desk, usePortfolio } from './useDesk';

type PF = ReturnType<typeof usePortfolio>;
type RTab = 'overview' | 'factors' | 'corr' | 'stress' | 'opt';

export function RiskPanel({ state, desk, pf, targets, onWhy }: { state: GameState; desk: Desk; pf: PF; targets: Record<string, number>; onWhy: (t: WhyTopic) => void }) {
  const [tab, setTab] = useState<RTab>('overview');
  return (
    <Panel title="Risk analytics" right={<span className="text-[10.5px] text-muted">desk model · draft book</span>}>
      <Tabs<RTab>
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'factors', label: 'Factors' },
          { id: 'corr', label: 'Correlation' },
          { id: 'stress', label: 'Stress' },
          { id: 'opt', label: 'Optimizer' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="pt-3">
        {tab === 'overview' && <Overview state={state} desk={desk} pf={pf} onWhy={onWhy} />}
        {tab === 'factors' && <Factors state={state} pf={pf} />}
        {tab === 'corr' && <Corr state={state} desk={desk} pf={pf} targets={targets} onWhy={onWhy} />}
        {tab === 'stress' && <Stress state={state} desk={desk} targets={targets} />}
        {tab === 'opt' && <Optimizer state={state} desk={desk} pf={pf} targets={targets} onWhy={onWhy} />}
      </div>
    </Panel>
  );
}

function Overview({ state, desk, pf, onWhy }: { state: GameState; desk: Desk; pf: PF; onWhy: (t: WhyTopic) => void }) {
  const ex = pf.exAnte;
  const cur = pf.current;
  if (!ex) return <div className="text-muted text-[12px]">Computing…</div>;
  const held = pf.risk.held;
  const totRc = held.reduce((a, i) => a + Math.max(0, pf.risk.rc.rc[i]), 0);
  const nav = state.nav;
  const rows: [string, string, string, string?][] = [
    ['Expected return / turn', signedPct(cur.er, 2), signedPct(ex.er, 2)],
    ['Volatility (annualised)', pct(cur.vol * Math.sqrt(52)), pct(ex.vol * Math.sqrt(52))],
    ['Expected log growth → CAGR', signedPct(annualFromWeeklyLog(cur.elog)), signedPct(annualFromWeeklyLog(ex.elog)), 'What compounds: E[log(1+R)] per turn, annualised.'],
    ['VaR 95% (1 turn)', money(Math.max(0, cur.var95) * nav), money(Math.max(0, ex.var95) * nav)],
    ['Expected shortfall 95%', money(Math.max(0, cur.es95) * nav), money(Math.max(0, ex.es95) * nav), 'Average loss in the worst 5% of desk scenarios.'],
    ['P(lose > 5% this turn)', pct(cur.pLoss5, 1), pct(ex.pLoss5, 1)],
    ['Diversification ratio', num(cur.divRatio, 2), num(ex.divRatio, 2), 'Σ standalone risk ÷ portfolio risk. 1 = no diversification.'],
  ];
  const s = ex.sizing;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="label">Book size vs. growth optimum <Info text="Your draft book's size as a multiple of the scale that maximises expected log growth for the same trades (desk model). 1.0 = full Kelly on your own trades." /></div>
          <button className="text-[11px] text-accent underline" onClick={() => onWhy('kelly')}>Why?</button>
        </div>
        {ex.heldIds.length && ex.kStar < 0.02 ? (
          <div className="text-[12px] text-neg mt-1 leading-snug">Under the desk model this combination of trades has negative expected growth at <b>any</b> size (after costs). The growth-optimal scale is zero.</div>
        ) : ex.heldIds.length ? (
          <>
            <KellyGauge s={s} />
            <div className="text-[12px] text-ink2 mt-1.5 leading-snug">
              Within your leverage and position limits, your book is <b className="num text-ink">{s > 20 ? '>20' : num(s, 2)}×</b> its growth-optimal size{' '}
              {s > 1.6 ? '— deep in over-betting territory: less growth, far more risk.' : s > 1.05 ? '— above full Kelly: extra risk buys no extra growth.' : s >= 0.25 ? '— inside the fractional-Kelly band most professionals use.' : '— very conservative; most of the available growth is unused.'}
              {' '}Your trade selection captures <b className="num text-ink">{pct(ex.selection, 0)}</b> of the best available growth.
            </div>
          </>
        ) : (
          <div className="text-[12px] text-muted">No positions in the draft book.</div>
        )}
      </div>

      <table className="w-full text-[12px]">
        <thead className="text-muted"><tr><th className="text-left font-medium py-1">Metric</th><th className="text-right font-medium">Current</th><th className="text-right font-medium">After orders</th></tr></thead>
        <tbody>
          {rows.map(([l, a, b, tip]) => (
            <tr key={l} className="border-t border-line"><td className="py-1.5 text-ink2">{l}{tip && <Info text={tip} />}</td><td className="num text-right text-muted">{a}</td><td className="num text-right font-semibold">{b}</td></tr>
          ))}
          <tr className="border-t border-line"><td className="py-1.5 text-ink2">Gross / margin</td><td className="num text-right text-muted">{mult(cur.gross)} / {pct(cur.margin, 0)}</td><td className="num text-right font-semibold">{mult(ex.gross)} / {pct(ex.margin, 0)}</td></tr>
        </tbody>
      </table>

      {held.length > 0 && (
        <div>
          <div className="label mb-1.5">Risk contribution <Info text="Share of portfolio volatility contributed by each position: w·(Σw)/σ. Includes correlation effects; negative = the position hedges the rest." /></div>
          <div className="space-y-1.5">
            {held
              .slice()
              .sort((a, b) => pf.risk.rc.rc[b] - pf.risk.rc.rc[a])
              .map((i) => {
                const id = desk.universe[i];
                const share = totRc > 0 ? pf.risk.rc.rc[i] / totRc : 0;
                return (
                  <div key={id} className="grid grid-cols-[minmax(0,1fr)_80px_44px] gap-2 items-center text-[11.5px]">
                    <span className="truncate text-ink2">{state.instruments[id].name}</span>
                    <Bar value={share} max={1} center={share < 0} tone={share < 0 ? 'var(--c3)' : share > pf.lvl.concentrationLimit && held.length > 1 ? 'var(--neg-fill)' : 'var(--c1)'} />
                    <span className="num text-right">{pct(share, 0)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {ex.breaches.length > 0 && (
        <div className="space-y-1">
          {ex.breaches.map((b) => <div key={b} className="text-[12px] text-neg">⚠ {b}</div>)}
        </div>
      )}
    </div>
  );
}

export function KellyGauge({ s }: { s: number }) {
  const max = 2.5;
  const x = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  return (
    <div className="mt-2">
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
        <div className="absolute inset-y-0" style={{ left: x(0.25), width: `calc(${x(1)} - ${x(0.25)})`, background: 'color-mix(in oklab, var(--pos-fill) 40%, transparent)' }} />
        <div className="absolute inset-y-0" style={{ left: x(1), width: `calc(${x(2)} - ${x(1)})`, background: 'color-mix(in oklab, var(--warn) 35%, transparent)' }} />
        <div className="absolute inset-y-0" style={{ left: x(2), right: 0, background: 'color-mix(in oklab, var(--neg-fill) 40%, transparent)' }} />
        <div className="absolute -inset-y-0.5 w-[3px] rounded" style={{ left: `calc(${x(s)} - 1.5px)`, background: 'var(--text)' }} />
      </div>
      <div className="relative h-4 text-[9.5px] text-muted num">
        {[0, 0.5, 1, 1.5, 2, 2.5].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: x(v) }}>{v}×</span>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-muted">
        <span>■ <span style={{ color: 'var(--pos-fill)' }}>¼–1× fractional Kelly</span></span>
        <span style={{ color: 'var(--warn)' }}>■ above Kelly</span>
        <span style={{ color: 'var(--neg-fill)' }}>■ growth ≤ 0 near 2×</span>
      </div>
    </div>
  );
}

function Factors({ state, pf }: { state: GameState; pf: PF }) {
  const fx = pf.risk.fx;
  const lim = pf.lvl.factorLimit * state.nav;
  const max = Math.max(lim * 1.5, ...FACTORS.map((f) => Math.abs(fx[f])));
  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-ink2 leading-snug">Expected P&L for a +1σ move in each latent factor, from the desk's estimated loadings. Dashed marks: risk limit (±{money(lim)}).</div>
      {FACTORS.map((f) => {
        const v = fx[f];
        const over = Math.abs(v) > lim && state.config.level > 1;
        return (
          <div key={f} className="grid grid-cols-[86px_minmax(0,1fr)_64px] gap-2 items-center text-[11.5px]" title={FACTOR_INFO[f].desc}>
            <span className="text-ink2 truncate">{FACTOR_INFO[f].name}</span>
            <div className="relative">
              <Bar value={v} max={max} center tone={over ? 'var(--neg-fill)' : v >= 0 ? 'var(--c1)' : 'var(--c2)'} height={8} />
              {state.config.level > 1 && (
                <>
                  <div className="absolute -top-1 -bottom-1 border-l border-dashed" style={{ left: `${50 + (lim / max) * 50}%`, borderColor: 'var(--muted)' }} />
                  <div className="absolute -top-1 -bottom-1 border-l border-dashed" style={{ left: `${50 - (lim / max) * 50}%`, borderColor: 'var(--muted)' }} />
                </>
              )}
            </div>
            <span className={`num text-right ${over ? 'text-neg font-semibold' : ''}`}>{signedMoney(v)}</span>
          </div>
        );
      })}
      <div className="text-[10.5px] text-muted leading-snug pt-1">Loadings the desk has not detected do not appear here. Risk research on a trade replaces its reported loadings with a measured estimate.</div>
    </div>
  );
}

function Corr({ state, desk, pf, targets, onWhy }: { state: GameState; desk: Desk; pf: PF; targets: Record<string, number>; onWhy: (t: WhyTopic) => void }) {
  const [stress, setStress] = useState(false);
  const idx = useMemo(() => {
    const held = desk.universe.map((id, i) => (targets[id] ? i : -1)).filter((i) => i >= 0);
    if (held.length >= 2) return held.slice(0, 12);
    return desk.universe.map((_, i) => i).filter((i) => state.instruments[desk.universe[i]].archetype !== 'future').slice(0, 10);
  }, [desk.universe, targets, state.instruments]);
  const C = stress ? pf.risk.corrStress : pf.risk.corrAll;
  const n = idx.length;
  let avg = 0, cnt = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) { avg += C[idx[a]][idx[b]]; cnt++; }
  avg = cnt ? avg / cnt : 0;
  const shares = pf.risk.held.map((i) => pf.risk.rc.rc[i]);
  const tot = shares.reduce((x, y) => x + y, 0);
  const nEff = tot > 0 ? 1 / shares.reduce((x, y) => x + (y / tot) ** 2, 0) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button className={`btn text-[11px] px-2 py-0.5 ${!stress ? 'btn-primary' : ''}`} onClick={() => setStress(false)}>Expected mix</button>
          <button className={`btn text-[11px] px-2 py-0.5 ${stress ? 'btn-primary' : ''}`} onClick={() => setStress(true)}>Stress regimes</button>
        </div>
        <button className="text-[11px] text-accent underline" onClick={() => onWhy('correlation')}>Why?</button>
      </div>
      <div className="text-[11.5px] text-ink2">
        {pf.risk.held.length >= 2 ? 'Your draft positions' : 'Available opportunities'} · average pairwise correlation <b className="num text-ink">{num(avg, 2)}</b>
        {pf.risk.held.length >= 2 && <> · effective number of independent bets <b className="num text-ink">{num(nEff, 1)}</b> of {pf.risk.held.length}</>}
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="text-[10px] num border-separate" style={{ borderSpacing: 2 }}>
          <tbody>
            {idx.map((i, a) => (
              <tr key={i}>
                <td className="pr-1 text-right text-ink2 font-sans whitespace-nowrap max-w-[110px] truncate" title={state.instruments[desk.universe[i]].name}>{state.instruments[desk.universe[i]].name.slice(0, 16)}</td>
                {idx.map((j, b) => (
                  <td key={j} title={`${state.instruments[desk.universe[i]].name} × ${state.instruments[desk.universe[j]].name}: ${C[i][j].toFixed(2)}`}
                    className="w-7 h-6 text-center rounded-sm" style={{ background: a === b ? 'var(--panel-2)' : divergingColor(C[i][j]), color: Math.abs(C[i][j]) > 0.55 && a !== b ? '#fff' : 'var(--text-2)' }}>
                    {a === b ? '' : C[i][j].toFixed(1).replace('0.', '.')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-muted leading-snug">Computed from the joint desk scenarios (shared factor shocks + idiosyncratic noise), not assumed. "Stress regimes" re-draws the same trades under volatility-spike, liquidity, credit and crowded-unwind conditions — watch the low correlations converge.</div>
    </div>
  );
}

function Stress({ state, desk, targets }: { state: GameState; desk: Desk; targets: Record<string, number> }) {
  const ids = desk.universe.filter((id) => targets[id]);
  const insts = ids.map((id) => state.instruments[id]);
  const notionals = ids.map((id) => targets[id]);
  const res = STRESS_SCENARIOS.map((sc) => ({ sc, ...stressPnl(insts, notionals, insts.map(deskParams), sc.Z) }));
  if (!ids.length) return <div className="text-muted text-[12px]">Add positions to run stress tests.</div>;
  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-ink2">Deterministic factor shocks applied to the draft book (desk loadings; idiosyncratic noise set to zero).</div>
      {res.map((r) => {
        const worstIdx = r.per.reduce((a, v, i) => (v < r.per[a] ? i : a), 0);
        return (
          <div key={r.sc.id} className="border-t border-line pt-2">
            <div className="flex justify-between gap-2">
              <span className="text-[12px] font-medium">{r.sc.name}</span>
              <span className={`num text-[12.5px] font-semibold ${toneClass(r.total)}`}>{signedMoney(r.total)} <span className="text-muted font-normal">({signedPct(r.total / state.nav)})</span></span>
            </div>
            <div className="text-[10.5px] text-muted">{r.sc.desc} {r.per[worstIdx] < 0 && <>Worst: {insts[worstIdx].name} {signedMoney(r.per[worstIdx])}.</>}</div>
          </div>
        );
      })}
    </div>
  );
}

function Optimizer({ state, desk, pf, targets, onWhy }: { state: GameState; desk: Desk; pf: PF; targets: Record<string, number>; onWhy: (t: WhyTopic) => void }) {
  const ex = pf.exAnte;
  if (!ex) return <div className="text-muted text-[12px]">Computing…</div>;
  const rows = desk.universe.map((id) => {
    const p = state.instruments[id];
    const q = desk.quotes[id];
    const kStand = kellyDiscrete(p.outcomes.map((o, k) => ({ r: o.r, p: q.probs[k] })), 40);
    return { id, name: p.name, yours: (targets[id] ?? 0) / state.nav, joint: ex.wOpt[id] ?? 0, stand: Math.min(kStand, p.maxPctNav) };
  }).filter((r) => r.yours || r.joint > 1e-3 || r.stand > 1e-3);
  const sum = (k: 'yours' | 'joint' | 'stand') => rows.reduce((a, r) => a + Math.abs(r[k]), 0);
  const g = (x: number) => signedPct(annualFromWeeklyLog(x), 1);
  return (
    <div className="space-y-3">
      <div className="text-[11.5px] text-ink2 leading-snug">
        The desk-model growth figures assume every quoted edge is right — some are not, so treat full Kelly as an upper bound. The portfolio-level log-optimal allocation from the desk scenarios, under the same leverage, position and cost constraints you face. Compare it with naively summing standalone Kelly sizes. <button className="text-accent underline" onClick={() => onWhy('sharpeAlloc')}>Why do they differ?</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        <div className="bg-panel2 rounded-md p-2"><div className="label text-[9.5px]">Growth: yours</div><div className="num font-semibold">{g(ex.elog)}</div></div>
        <div className="bg-panel2 rounded-md p-2"><div className="label text-[9.5px]">Growth: full Kelly</div><div className="num font-semibold">{g(ex.gOpt)}</div></div>
        <div className="bg-panel2 rounded-md p-2"><div className="label text-[9.5px]">Growth: ½ Kelly</div><div className="num font-semibold">{g(ex.gHalf)}</div></div>
        <div className="bg-panel2 rounded-md p-2"><div className="label text-[9.5px]">Growth: cash</div><div className="num font-semibold">{g(ex.gCash)}</div></div>
      </div>
      <table className="w-full text-[11.5px]">
        <thead className="text-muted"><tr><th className="text-left font-medium py-1">Trade</th><th className="text-right font-medium">Yours</th><th className="text-right font-medium">Joint Kelly</th><th className="text-right font-medium">Standalone</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1 truncate max-w-[130px] text-ink2" title={r.name}>{r.name}</td>
              <td className="num text-right">{pct(r.yours, 0)}</td>
              <td className="num text-right">{pct(r.joint, 0)}</td>
              <td className="num text-right text-muted">{pct(r.stand, 0)}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold"><td className="py-1">Gross</td><td className="num text-right">{pct(sum('yours'), 0)}</td><td className="num text-right">{pct(sum('joint'), 0)}</td><td className="num text-right text-muted">{pct(sum('stand'), 0)}</td></tr>
        </tbody>
      </table>
      <div className="text-[10.5px] text-muted leading-snug">
        Full Kelly on estimated inputs is aggressive: the estimates carry error, and the desk can miss shared exposures. Treat it as an upper bound, not a target. Annualised growth figures assume this turn's opportunity set repeats.
      </div>
    </div>
  );
}
