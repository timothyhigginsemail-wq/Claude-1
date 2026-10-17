import { useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { costMultBelief, fundedFrac, holdRate, levelCfg, tcRate, type GameState } from '../../engine/game';
import { ARCHETYPE_INFO, outcomeProbs } from '../../engine/instruments';
import { kellyDiscrete, kellyShrinkage } from '../../engine/kelly';
import { FACTORS } from '../../engine/market';
import { drawdownCurve, growthCurve, wealthFan, type JointSample } from '../../engine/sizing';
import { deskPairs } from '../../engine/game';
import { AXIS, GRID, Legend, makeTooltip } from '../charts';
import { Collapse, Info, Panel, Tabs, useDebounced } from '../kit';
import { bp, money, num, pct, signedMoney } from '../format';
import type { WhyTopic } from '../content';
import type { Desk } from './useDesk';

type Mode = 'usd' | 'nav' | 'risk' | 'vol';
type ChartTab = 'growth' | 'marginal' | 'paths' | 'dd';

export function SizingWorkspace(props: {
  state: GameState;
  desk: Desk;
  id: string;
  targets: Record<string, number>;
  setTarget: (id: string, n: number) => void;
  userProb?: number;
  setUserProb: (p: number | undefined) => void;
  onResearch: (id: string, kind: 'signal' | 'risk') => void;
  onWhy: (t: WhyTopic) => void;
}) {
  const { state, desk, id, targets } = props;
  const p = state.instruments[id];
  const q = desk.quotes[id];
  const nav = state.nav;
  const lvl = levelCfg(state);
  const info = ARCHETYPE_INFO[p.archetype];
  const target = targets[id] ?? 0;
  const held = state.positions[id]?.notional ?? 0;
  const [mode, setMode] = useState<Mode>('nav');
  const [tab, setTab] = useState<ChartTab>('growth');
  const [withBook, setWithBook] = useState(false);
  const [ddThr, setDdThr] = useState(0.2);
  const worst = -q.worst;
  const canAdd = state.offered.includes(id) || !!state.positions[id];

  // allowed range
  const otherGross = Object.entries(targets).reduce((a, [k, n]) => (k === id ? a : a + Math.abs(n)), 0);
  const grossRoom = Math.max(0, lvl.maxGross * (state.deriskActive ? 0.5 : 1) * nav - (state.config.level === 1 ? 0 : otherGross));
  const maxAbs = Math.max(0, Math.min(p.maxPctNav * nav, grossRoom, canAdd ? Infinity : Math.abs(held)));
  const minN = p.allowShort ? -maxAbs : 0;
  const maxN = maxAbs;

  const toDisplay = (n: number) => (mode === 'usd' ? n : mode === 'nav' ? (n / nav) * 100 : mode === 'risk' ? Math.abs(n) * worst : ((Math.abs(n) / nav) * q.sd * Math.sqrt(52)) * 100);
  const fromDisplay = (v: number, sign = Math.sign(target) || 1) => {
    if (mode === 'usd') return v;
    if (mode === 'nav') return (v / 100) * nav;
    if (mode === 'risk') return sign * (worst > 0 ? v / worst : 0);
    return sign * ((v / 100 / Math.sqrt(52)) * nav) / Math.max(q.sd, 1e-9);
  };
  const setN = (n: number) => props.setTarget(id, Math.round(Math.max(minN, Math.min(maxN, n))));

  // ---- sizing analytics ----
  const col = desk.universe.indexOf(id);
  const f = target / nav;
  const dir = f < 0 ? -1 : 1;
  const debF = useDebounced(f, 120);
  const mult = costMultBelief(state.belief);
  const unitCost = tcRate(p, mult, 0) + holdRate(p, state.indicators);
  const js: JointSample = useMemo(() => {
    const S = desk.sc.S, N = desk.sc.N;
    const r = new Float64Array(S);
    const rest = new Float64Array(S);
    for (let s = 0; s < S; s++) {
      r[s] = dir * desk.sc.R[s * N + col];
      if (withBook) {
        let x = 0;
        desk.universe.forEach((uid, j) => {
          if (j !== col && targets[uid]) x += (targets[uid] / nav) * desk.sc.R[s * N + j];
        });
        rest[s] = x;
      }
    }
    return { r, rest, restCost: 0, unitCost };
  }, [desk, col, withBook, withBook ? targets : null, nav, dir, unitCost]); // eslint-disable-line react-hooks/exhaustive-deps

  const outcomesQ = p.outcomes.map((o, k) => ({ r: dir * o.r, p: q.probs[k] }));
  const kFull = kellyDiscrete(outcomesQ, 40);
  const ruin = worst > 0 ? 1 / (dir > 0 ? worst : q.best) : 40;
  // uncertainty-adjusted: variance of the Kelly estimate implied by the stated band
  const pairs = useMemo(() => deskPairs(state), [state]);
  const kLo = kellyDiscrete(p.outcomes.map((o, k) => ({ r: dir * o.r, p: outcomeProbs(p, p.estDrift - p.statedSe, p.betaEst, p.idioEst, pairs)[k] })), 40);
  const kHi = kellyDiscrete(p.outcomes.map((o, k) => ({ r: dir * o.r, p: outcomeProbs(p, p.estDrift + p.statedSe, p.betaEst, p.idioEst, pairs)[k] })), 40);
  const kVar = ((kHi - kLo) / 2) ** 2;
  const shrink = kellyShrinkage(kFull, kVar);

  const xMax = Math.min(ruin * 0.98, Math.max(Math.abs(f) * 1.5, kFull * 2.4, 0.05, (state.config.level === 1 ? 0.6 : 0.3)), p.maxPctNav * 1.2, lvl.maxGross);
  const curve = useMemo(() => growthCurve(js, xMax, 60), [js, xMax]);
  const bookKelly = useMemo(() => {
    let best = curve[0];
    for (const c of curve) if (c.elog > best.elog) best = c;
    return best.f;
  }, [curve]);
  const fan = useMemo(() => (tab === 'paths' ? wealthFan(js, Math.abs(debF), 26, 700) : null), [js, debF, tab]);
  const ddc = useMemo(() => (tab === 'dd' ? drawdownCurve(js, xMax, ddThr, 26, 400, 30) : null), [js, xMax, ddThr, tab]);

  const stats = useMemo(() => {
    const n = Math.abs(target);
    const ev = target * q.ev;
    const evLo = target * (dir > 0 ? q.evLo : q.evHi);
    const evHi = target * (dir > 0 ? q.evHi : q.evLo);
    const pLoss = q.probs.reduce((a, pr, k) => a + (dir * p.outcomes[k].r < 0 ? pr : 0), 0);
    return {
      notional: n,
      margin: n * p.margin,
      car: n * (dir > 0 ? worst : q.best),
      ev,
      evLo,
      evHi,
      sd: n * q.sd,
      pLoss,
      net: target * p.netFraction,
      funded: n * fundedFrac(p.archetype),
      cost: Math.abs(target - held) * tcRate(p, mult, target - held),
    };
  }, [target, q, p, worst, dir, held, mult]);

  const at = (ff: number) => curve.reduce((a, c) => (Math.abs(c.f - ff) < Math.abs(a.f - ff) ? c : a), curve[0]);
  const here = at(Math.abs(f));
  const twice = at(Math.min(xMax, Math.abs(f) * 2));
  const volTargetN = (0.1 / Math.sqrt(52) / Math.max(q.sd, 1e-9)) * nav;

  const rules = [
    { key: 'kelly', label: 'Full Kelly (standalone)', f: kFull, note: 'Maximises E[log wealth] for this trade alone, trusting the point estimate.' },
    { key: 'half', label: '½ Kelly', f: kFull / 2, note: '≈75% of the growth with half the volatility.' },
    { key: 'quarter', label: '¼ Kelly', f: kFull / 4, note: 'Common for noisy, crowded or fat-tailed edges.' },
    { key: 'shrunk', label: 'Uncertainty-adjusted Kelly', f: kFull * shrink, note: `Kelly × f*²/(f*²+Var f̂) = ${num(shrink, 2)} given the stated estimation band.` },
    { key: 'book', label: 'Kelly given current book', f: withBook ? bookKelly : NaN, note: 'Best size for this trade holding the rest of your draft book fixed (toggle "with current book").' },
    { key: 'vol', label: 'Vol target 10% ann.', f: volTargetN / nav, note: 'Position standalone volatility = 10%/yr of NAV.' },
    { key: 'ff', label: 'Fixed fraction (2% at risk)', f: worst > 0 ? 0.02 / worst : NaN, note: 'Worst modelled outcome costs 2% of NAV.' },
    { key: 'fd', label: 'Fixed dollar ($50k)', f: 50_000 / nav, note: 'Ignores wealth, edge and risk.' },
  ];

  const T = makeTooltip((l) => `Exposure ${pct(Number(l), 0)} of NAV`, (v) => `${(v * 100).toFixed(3)}%`);

  return (
    <Panel
      title={<span className="flex items-center gap-2">Sizing workspace</span>}
      right={<span className="chip" style={{ color: info.color, borderColor: 'currentColor' }}>{info.name}</span>}
    >
      <div className="space-y-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-[17px] font-semibold">{p.name}</h2>
            <span className="num text-muted text-[11.5px]">{p.ticker}{p.manager ? ` · PM ${p.manager}` : ''}</span>
          </div>
          <p className="text-ink2 text-[12.5px] mt-1 leading-relaxed">{p.thesis}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {p.notes.map((n) => <span key={n} className="chip">{n}</span>)}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2.5 text-[11px]">
            <Term label="Holding" value={p.expiresTurn > 1e8 ? 'open-ended' : `${p.expiresTurn - state.turn + 1} turn${p.expiresTurn - state.turn ? 's' : ''}`} />
            <Term label="Margin" value={pct(p.margin, 0)} />
            <Term label="Trading cost" value={`${num(p.tcBps * mult, 1)}bp+impact`} />
            <Term label="Financing" value={`${num(holdRate(p, state.indicators) * 1e4, 2)}bp/turn`} />
            <Term label="Capacity" value={money(p.capacity)} />
            <Term label="Exposure" value={p.netFraction === 0 ? 'market-neutral' : p.netFraction === 1 ? 'directional' : `${pct(p.netFraction, 0)} net`} />
          </div>
        </div>

        <PayoffTable state={state} desk={desk} id={id} target={target} dir={dir} />

        <div className="flex flex-wrap gap-2">
          {!p.research.signal && p.researchCost.signal > 0 && (
            <button className="btn text-[12px]" onClick={() => props.onResearch(id, 'signal')}>Buy signal research ({money(p.researchCost.signal * nav)})</button>
          )}
          {!p.research.risk && p.researchCost.risk > 0 && (
            <button className="btn text-[12px]" onClick={() => props.onResearch(id, 'risk')}>Buy risk/crowding analysis ({money(p.researchCost.risk * nav)})</button>
          )}
          <span className="text-[11px] text-muted self-center">Research is imperfect and costs NAV immediately.</span>
        </div>

        {/* size control */}
        <div className="rounded-lg border border-line p-3 space-y-2" style={{ background: 'var(--panel-2)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="label">Position size {held ? <span className="normal-case tracking-normal font-normal text-ink2">· currently {money(held)}</span> : null}</div>
            <div className="flex gap-1">
              {([['usd', '$ notional'], ['nav', '% NAV'], ['risk', 'Capital at risk'], ['vol', 'Vol (ann. % NAV)']] as [Mode, string][]).map(([m, l]) => (
                <button key={m} className={`btn text-[11px] px-2 py-1 ${mode === m ? 'btn-primary' : ''}`} onClick={() => setMode(m)}>{l}</button>
              ))}
            </div>
          </div>
          {!canAdd && <div className="text-[11.5px] text-warn">This opportunity has closed to new money; you can only reduce or close.</div>}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={minN}
              max={Math.max(maxN, 1)}
              step={Math.max(1, Math.round(maxN / 400))}
              value={target}
              onChange={(e) => setN(Number(e.target.value))}
              aria-label="Position size"
              disabled={maxN <= 0 && !held}
            />
            <input
              type="number"
              className="w-28 num text-right"
              value={Number(toDisplay(target).toFixed(mode === 'usd' ? 0 : 2))}
              onChange={(e) => setN(fromDisplay(Number(e.target.value)))}
              step={mode === 'usd' ? 1000 : 0.1}
            />
            <span className="text-muted text-[11px] w-10">{mode === 'usd' ? '$' : mode === 'risk' ? '$ risk' : '%'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className="btn text-[11px] px-2 py-0.5" onClick={() => setN(0)}>Zero</button>
            {held !== 0 && <button className="btn text-[11px] px-2 py-0.5" onClick={() => setN(held)}>Keep {money(held)}</button>}
            {[0.05, 0.1, 0.25, 0.5, 1].filter((x) => x * nav <= maxN + 1).map((x) => (
              <button key={x} className="btn text-[11px] px-2 py-0.5" onClick={() => setN(x * nav * (dir < 0 ? -1 : 1))}>{pct(x, 0)} NAV</button>
            ))}
            {p.allowShort && <button className="btn text-[11px] px-2 py-0.5" onClick={() => setN(-target || -0.1 * nav)}>Flip side</button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] pt-1">
            <label className="flex items-center gap-2 text-ink2">
              <input type="checkbox" checked={props.userProb !== undefined} onChange={(e) => props.setUserProb(e.target.checked ? Math.round(q.win * 100) / 100 : undefined)} />
              Your estimate of P(win)
            </label>
            {props.userProb !== undefined && (
              <>
                <input type="number" min={0} max={100} step={1} className="w-16 num" value={Math.round(props.userProb * 100)} onChange={(e) => props.setUserProb(Math.max(0, Math.min(100, Number(e.target.value))) / 100)} />
                <span className="text-muted">% (desk: {pct(q.win, 1)}) — scored for calibration</span>
              </>
            )}
          </div>
        </div>

        {/* stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
          <Mini label="Gross notional" value={money(stats.notional)} sub={pct(stats.notional / nav) + ' of NAV'} />
          <Mini label="Capital committed" value={money(stats.margin)} sub="margin / collateral" />
          <Mini label="Capital at risk" value={money(stats.car)} sub={`max modelled loss · ${pct(stats.car / nav)}`} tone="text-neg" />
          <Mini label="Net exposure" value={money(stats.net)} sub={p.netFraction === 0 ? 'market-neutral legs' : 'directional'} />
          <Mini label="Expected P&L / turn" value={signedMoney(stats.ev)} sub={`95%: ${signedMoney(stats.evLo)} … ${signedMoney(stats.evHi)}`} tone={stats.ev >= 0 ? 'text-pos' : 'text-neg'} />
          <Mini label="Volatility / turn" value={money(stats.sd)} sub={`${pct((stats.sd / nav) * Math.sqrt(52))} of NAV ann.`} />
          <Mini label="P(loss this turn)" value={pct(stats.pLoss, 0)} sub={`expected log growth ${(here.elog * 1e4).toFixed(1)}bp`} />
          <Mini label="Trading cost" value={money(stats.cost)} sub={`impact vs capacity ${pct(Math.abs(target - held) / p.capacity, 0)}`} />
        </div>

        {/* charts */}
        <div className="rounded-lg border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
            <Tabs<ChartTab>
              tabs={[
                { id: 'growth', label: 'Growth vs size' },
                { id: 'marginal', label: 'Marginal benefit vs cost' },
                { id: 'paths', label: 'Wealth paths' },
                { id: 'dd', label: 'Drawdown risk' },
              ]}
              value={tab}
              onChange={setTab}
              className="border-b-0"
            />
            {state.config.level > 1 && (
              <label className="flex items-center gap-1.5 text-[11.5px] text-ink2 pr-1">
                <input type="checkbox" checked={withBook} onChange={(e) => setWithBook(e.target.checked)} /> with current book
                <Info text="Off: this trade alone. On: the rest of your draft portfolio is held fixed, so correlations with existing positions change the growth-optimal size." />
              </label>
            )}
          </div>
          <div className="p-2">
            {tab === 'growth' && (
              <>
                <div className="h-[230px]">
                  <ResponsiveContainer>
                    <ComposedChart data={curve} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="f" type="number" domain={[0, xMax]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} {...AXIS} width={52} />
                      <Tooltip content={<T />} />
                      <ReferenceLine y={0} stroke="var(--axis)" />
                      <Line type="monotone" dataKey="er" name="Expected return (arithmetic)" stroke="var(--c2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="elog" name="Expected log growth" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="drag" name="Volatility drag" stroke="var(--c8)" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      <ReferenceLine x={withBook ? bookKelly : kFull} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'Kelly', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />
                      <ReferenceLine x={Math.abs(f)} stroke="var(--accent)" strokeWidth={1.5} />
                      <ReferenceDot x={here.f} y={here.elog} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Legend items={[{ label: 'Expected return (arithmetic)', color: 'var(--c2)' }, { label: 'Expected log growth (compounds)', color: 'var(--c1)' }, { label: 'Volatility drag', color: 'var(--c8)', dash: true }, { label: 'Your size', color: 'var(--accent)' }]} />
                <div className="text-[12px] text-ink2 mt-2 leading-relaxed">
                  At <b className="text-ink">{money(Math.abs(target))}</b>: expected profit <b className="text-ink num">{signedMoney(here.er * nav)}</b>/turn, volatility drag costs <b className="text-ink num">{money(here.drag * nav)}</b>, so wealth compounds at about <b className="text-ink num">{signedMoney(here.elog * nav)}</b>/turn.
                  {Math.abs(f) > 0 && <> Doubling to {money(Math.abs(target) * 2)} doubles the profit to {signedMoney(twice.er * nav)} but roughly <b>quadruples</b> the drag to {money(twice.drag * nav)} → {signedMoney(twice.elog * nav)}/turn.</>}{' '}
                  <button className="text-accent underline" onClick={() => props.onWhy('volDrag')}>Why?</button>
                </div>
              </>
            )}
            {tab === 'marginal' && (
              <>
                <div className="h-[230px]">
                  <ResponsiveContainer>
                    <ComposedChart data={curve.slice(1)} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="f" type="number" domain={[0, xMax]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} {...AXIS} width={52} />
                      <Tooltip content={<T />} />
                      <ReferenceLine y={0} stroke="var(--axis)" />
                      <Line type="monotone" dataKey="mBenefit" name="Marginal benefit (edge per extra $)" stroke="var(--c3)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="mCost" name="Marginal cost (extra drag per extra $)" stroke="var(--c8)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <ReferenceLine x={withBook ? bookKelly : kFull} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'benefit = cost', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />
                      <ReferenceLine x={Math.abs(f)} stroke="var(--accent)" strokeWidth={1.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Legend items={[{ label: 'Marginal benefit', color: 'var(--c3)' }, { label: 'Marginal drag', color: 'var(--c8)' }, { label: 'Your size', color: 'var(--accent)' }]} />
                <div className="text-[12px] text-ink2 mt-2 leading-relaxed">
                  Each extra dollar of exposure adds the same edge (<span className="num">{bp(q.ev * dir - unitCost, 1)}</span> per $ — a flat line), but adds more drag than the last one: drag ≈ ½σ²f², so the marginal drag ≈ σ²f rises in a straight line{withBook ? ' (plus your covariance with the existing book)' : ''}. Below the crossing, adding size increases compound growth; beyond it, every extra dollar reduces it.
                </div>
              </>
            )}
            {tab === 'paths' && fan && (
              <>
                <div className="h-[230px]">
                  <ResponsiveContainer>
                    <ComposedChart data={fan.fan.map((x) => ({ ...x, band95: [x.p5, x.p95], band50: [x.p25, x.p75] }))} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="t" {...AXIS} tickFormatter={(v) => `${v}`} />
                      <YAxis {...AXIS} width={52} tickFormatter={(v) => money(v * nav)} domain={['auto', 'auto']} />
                      <Tooltip content={makeTooltip((l) => `After ${l} turns`, (v) => money(v * nav))} />
                      <Area dataKey="band95" name="5–95th pct" stroke="none" fill="var(--c1)" fillOpacity={0.12} isAnimationActive={false} />
                      <Area dataKey="band50" name="25–75th pct" stroke="none" fill="var(--c1)" fillOpacity={0.22} isAnimationActive={false} />
                      <Line dataKey="p50" name="Median" stroke="var(--c1)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                      <Line dataKey="mean" name="Mean" stroke="var(--c2)" strokeWidth={1.8} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                      <ReferenceLine y={1} stroke="var(--axis)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <Legend items={[{ label: 'Median wealth', color: 'var(--c1)' }, { label: 'Mean wealth', color: 'var(--c2)', dash: true }]} />
                <div className="text-[12px] text-ink2 mt-2 leading-relaxed">
                  If you made this bet every turn for 26 turns at {pct(Math.abs(debF))} of current wealth: median outcome <b className="num text-ink">{money(fan.fan[26].p50 * nav)}</b>, mean <b className="num text-ink">{money(fan.fan[26].mean * nav)}</b>; {pct(fan.terminal.filter((w) => w < 1).length / fan.terminal.length, 0)} of paths end below today's NAV and {pct(fan.ddProb(ddThr), 0)} suffer a drawdown ≥ {pct(ddThr, 0)}.
                  The mean sits above the median because a few lucky paths drag the average up — the typical path follows log growth. <button className="text-accent underline" onClick={() => props.onWhy('logVsMean')}>Why?</button>
                </div>
              </>
            )}
            {tab === 'dd' && ddc && (
              <>
                <div className="flex items-center gap-2 text-[12px] mb-1">
                  <span className="text-muted">Drawdown threshold</span>
                  <input type="range" min={0.05} max={0.6} step={0.05} value={ddThr} onChange={(e) => setDdThr(Number(e.target.value))} className="max-w-[200px]" />
                  <span className="num">{pct(ddThr, 0)}</span>
                </div>
                <div className="h-[210px]">
                  <ResponsiveContainer>
                    <ComposedChart data={ddc} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="f" type="number" domain={[0, xMax]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} {...AXIS} width={44} />
                      <Tooltip content={makeTooltip((l) => `Exposure ${pct(Number(l), 0)} of NAV`, (v) => pct(v, 1))} />
                      <Line dataKey="p" name={`P(drawdown ≥ ${pct(ddThr, 0)} within 26 turns)`} stroke="var(--c8)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                      <ReferenceLine x={Math.abs(f)} stroke="var(--accent)" strokeWidth={1.5} />
                      <ReferenceLine x={withBook ? bookKelly : kFull} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'Kelly', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[12px] text-ink2 mt-1 leading-relaxed">
                  Even at full Kelly the probability of a deep drawdown is high — Kelly maximises long-run growth, not comfort. Fractional Kelly trades a little growth for a large reduction in drawdown risk.
                </div>
              </>
            )}
          </div>
        </div>

        <Collapse title="Sizing guide (optional)" right={<span className="text-[11px] text-muted">reference sizes — not a solver</span>}>
          <table className="w-full text-[12px]">
            <thead className="text-muted text-left">
              <tr><th className="py-1 font-medium">Rule</th><th className="font-medium text-right">Notional</th><th className="font-medium text-right">% NAV</th><th className="font-medium text-right">At risk</th></tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.key} className="border-t border-line" title={r.note}>
                  <td className="py-1.5 pr-2">
                    {r.label}
                    <div className="text-[10.5px] text-muted">{r.note}</div>
                  </td>
                  <td className="num text-right">{isFinite(r.f) ? money(r.f * nav) : '—'}</td>
                  <td className="num text-right">{isFinite(r.f) ? pct(r.f, 1) : '—'}</td>
                  <td className="num text-right">{isFinite(r.f) ? money(r.f * nav * (dir > 0 ? worst : q.best)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[11px] text-muted mt-2 leading-relaxed">
            Kelly here uses the desk's estimated distribution over next turn's regime mix (including tails), not a Gaussian approximation. Gaussian μ/σ² would say {pct(Math.max(0, (dir * q.ev) / (q.sd * q.sd)), 0)}. Standalone Kelly ignores correlation with your book and the hidden-factor risk the desk may have missed. <button className="text-accent underline" onClick={() => props.onWhy('estimation')}>Why shrink?</button>
          </div>
          <div className="text-[11px] text-muted mt-1">Desk factor loadings: {p.betaEst.map((b, i) => (Math.abs(b) > 0.05 ? `${FACTORS[i]} ${b.toFixed(2)}` : null)).filter(Boolean).join(' · ') || 'none material'}</div>
        </Collapse>
      </div>
    </Panel>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel2 rounded-md px-2 py-1">
      <div className="text-[9.5px] uppercase tracking-wider text-muted">{label}</div>
      <div className="num text-[11.5px] truncate">{value}</div>
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="label text-[9.5px]">{label}</div>
      <div className={`num text-[14px] font-semibold ${tone ?? ''}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted truncate num">{sub}</div>}
    </div>
  );
}

function PayoffTable({ state, desk, id, target, dir }: { state: GameState; desk: Desk; id: string; target: number; dir: number }) {
  const p = state.instruments[id];
  const q = desk.quotes[id];
  const truth = desk.truth?.[id];
  const max = Math.max(...q.probs);
  const pairs = deskPairs(state);
  const lo = outcomeProbs(p, p.estDrift - 1.96 * p.statedSe, p.betaEst, p.idioEst, pairs);
  const hi = outcomeProbs(p, p.estDrift + 1.96 * p.statedSe, p.betaEst, p.idioEst, pairs);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="label">Payoff distribution (next turn, desk estimate)</div>
        <div className="text-[11px] text-muted">P(win) <span className="num text-ink">{pct(q.win, 1)}</span> · 95% band <span className="num">{pct(q.winLo, 0)}–{pct(q.winHi, 0)}</span></div>
      </div>
      <div className="space-y-1">
        {p.outcomes.map((o, k) => {
          const a = Math.min(lo[k], hi[k]);
          const b = Math.max(lo[k], hi[k]);
          return (
            <div key={k} className="grid grid-cols-[minmax(0,1.3fr)_62px_minmax(0,2fr)_48px_72px] items-center gap-2 text-[11.5px]">
              <span className="truncate text-ink2">{o.label}{o.terminal ? ' ⏹' : ''}</span>
              <span className={`num text-right ${o.r >= 0 ? 'text-pos' : 'text-neg'}`}>{o.r >= 0 ? '+' : ''}{pct(o.r, 1)}</span>
              <div className="relative h-3.5">
                <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(q.probs[k] / max) * 100}%`, background: dir * o.r >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)', opacity: 0.8 }} />
                <div className="absolute top-1/2 h-px" style={{ left: `${(a / max) * 100}%`, width: `${Math.max(0.5, ((b - a) / max) * 100)}%`, background: 'var(--text-2)' }} />
                {truth && <div className="absolute -top-0.5 -bottom-0.5 w-[2px]" style={{ left: `${Math.min(100, (truth[k] / max) * 100)}%`, background: 'var(--warn)' }} title={`True ${pct(truth[k], 1)}`} />}
              </div>
              <span className="num text-right">{pct(q.probs[k], 1)}</span>
              <span className="num text-right text-muted">{target ? signedMoney(target * o.r) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="text-[10.5px] text-muted mt-1.5 leading-snug">
        Bars: desk-estimated probabilities; whiskers: range implied by the stated estimation error. ⏹ = the trade resolves and closes.
        The true data-generating process is hidden — estimates can be biased, overconfident, or stale after a regime change.
        {truth && <span className="text-warn"> Transparent mode: amber ticks show true probabilities.</span>}
      </div>
    </div>
  );
}
