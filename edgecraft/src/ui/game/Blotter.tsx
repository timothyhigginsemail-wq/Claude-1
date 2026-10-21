import { useEffect, useMemo, useRef, useState } from 'react';
import { POD_PACE, type GameState, type OrderCheck } from '../../engine/game';
import { ARCHETYPE_INFO, type InstrumentPublic } from '../../engine/instruments';
import { FACTORS } from '../../engine/market';
import { goldenMax } from '../../engine/math';
import { latentSlope, type Quote } from '../../engine/risk';
import { Panel, useDebounced } from '../kit';
import { money, mult, pct, signedMoney, toneClass } from '../format';
import type { Desk } from './useDesk';
import { themeFor } from './themes';

type Filter = 'all' | 'held' | 'new' | 'pods' | 'hedges';

const CHIPS = [0.05, 0.1, 0.25, 0.5];
const SCALES = [0.5, 0.75, 1.25, 1.5, 2];

interface Impact {
  /** Change in annualised portfolio volatility, as a fraction of NAV. */
  dVol: number;
  /** Change in expected log growth per week. */
  dGrowth: number;
  factor: string;
  factorDelta: number;
}

/**
 * For each pending order: what it does to the whole book (vs. the book without
 * that order), from the desk's joint scenarios. Optionally, each instrument's
 * growth-optimal size holding the rest of the book fixed.
 */
function useBookAnalytics(state: GameState, desk: Desk, targets: Record<string, number>, baseline: Record<string, number>, withKelly: boolean) {
  const t = useDebounced(targets, 150);
  return useMemo(() => {
    const { sc } = desk;
    const ids = desk.universe;
    const nav = state.nav;
    const w = ids.map((id) => (t[id] ?? 0) / nav);
    const pr = new Float64Array(sc.S);
    for (let s = 0; s < sc.S; s++) {
      let r = 0;
      for (let i = 0; i < sc.N; i++) if (w[i]) r += w[i] * sc.R[s * sc.N + i];
      pr[s] = r;
    }
    const stats = (f: (s: number) => number) => {
      let m = 0, g = 0, v = 0;
      for (let s = 0; s < sc.S; s++) {
        const x = f(s);
        m += x;
        g += x > -0.999 ? Math.log1p(x) : -10;
      }
      m /= sc.S;
      for (let s = 0; s < sc.S; s++) v += (f(s) - m) ** 2;
      return { vol: Math.sqrt(v / (sc.S - 1)) * Math.sqrt(52), g: g / sc.S };
    };
    const full = stats((s) => pr[s]);
    const impact: Record<string, Impact> = {};
    const kelly: Record<string, number> = {};
    const q05: Record<string, number> = {};
    ids.forEach((id, i) => {
      const col = new Float64Array(sc.S);
      for (let s = 0; s < sc.S; s++) col[s] = sc.R[s * sc.N + i];
      col.sort();
      q05[id] = col[Math.floor(sc.S * 0.05)];
      const held = (baseline[id] ?? 0) / nav;
      const p = state.instruments[id];
      if (Math.abs(w[i] - held) * nav >= 1) {
        const d = w[i] - held;
        const without = stats((s) => pr[s] - d * sc.R[s * sc.N + i]);
        const slope = latentSlope(p);
        let fi = 0;
        p.betaEst.forEach((b, k) => { if (Math.abs(b) > Math.abs(p.betaEst[fi])) fi = k; });
        impact[id] = { dVol: full.vol - without.vol, dGrowth: full.g - without.g, factor: FACTORS[fi], factorDelta: d * nav * slope * p.betaEst[fi] };
      }
      if (withKelly) {
        const canAdd = state.offered.includes(id) || !!state.positions[id];
        const hi = canAdd ? p.maxPctNav : Math.abs(held);
        const lo = p.allowShort ? -hi : 0;
        const g = (f: number) => {
          let acc = 0;
          for (let s = 0; s < sc.S; s++) {
            const x = pr[s] + (f - w[i]) * sc.R[s * sc.N + i];
            if (x <= -0.999) return -1e9;
            acc += Math.log1p(x);
          }
          return acc / sc.S;
        };
        kelly[id] = goldenMax(g, lo, hi, 1e-4);
      }
    });
    return { impact, kelly, q05, vol: full.vol, growth: full.g };
  }, [state, desk, t, baseline, withKelly]);
}

/** One row per tradable instrument with one-click sizing: the fast way to build a book. */
export function Blotter({ state, desk, targets, baseline, setTarget, setAll, onDetails, check, reset }: {
  state: GameState;
  /** The book carried into this week (current positions, rebalanced in %-of-NAV mode). */
  baseline: Record<string, number>;
  desk: Desk;
  targets: Record<string, number>;
  setTarget: (id: string, n: number) => void;
  setAll: (f: (t: Record<string, number>) => Record<string, number>) => void;
  onDetails: (id: string) => void;
  check: OrderCheck;
  reset: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showKelly, setShowKelly] = useState(false);
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nav = state.nav;
  const an = useBookAnalytics(state, desk, targets, baseline, showKelly);
  const kind = (p: InstrumentPublic) => (p.archetype === 'pod' ? 'pods' : p.archetype === 'future' || p.archetype === 'tailhedge' ? 'hedges' : 'new');
  const rank = (id: string) => {
    const p = state.instruments[id];
    if (state.positions[id]) return 0;
    return { new: 1, pods: 2, hedges: 3 }[kind(p)];
  };
  const ids = desk.universe
    .filter((id) => {
      const p = state.instruments[id];
      if (filter === 'all') return true;
      if (filter === 'held') return !!state.positions[id] || !!targets[id];
      return kind(p) === filter;
    })
    .sort((a, b) => rank(a) - rank(b));
  const counts = {
    held: desk.universe.filter((id) => state.positions[id] || targets[id]).length,
    new: desk.universe.filter((id) => kind(state.instruments[id]) === 'new').length,
    pods: desk.universe.filter((id) => kind(state.instruments[id]) === 'pods').length,
    hedges: desk.universe.filter((id) => kind(state.instruments[id]) === 'hedges').length,
  };

  const limitFor = (id: string) => {
    const p = state.instruments[id];
    const canAdd = state.offered.includes(id) || !!state.positions[id];
    const maxN = canAdd ? p.maxPctNav * nav : Math.abs(state.positions[id]?.notional ?? 0);
    let lo = p.allowShort ? -maxN : 0;
    let hi = maxN;
    if (p.archetype === 'pod') {
      // capital moves into and out of pods slowly
      const cur = state.positions[id]?.notional ?? 0;
      lo = Math.max(lo, cur - POD_PACE * nav);
      hi = Math.min(hi, cur + POD_PACE * nav);
    }
    return { maxN: hi, minN: lo };
  };
  const clampFor = (id: string, n: number) => {
    const { maxN, minN } = limitFor(id);
    return Math.round(Math.max(minN, Math.min(maxN, n)));
  };
  const scaleBook = (k: number) =>
    setAll((t) => {
      const next = { ...t };
      for (const [id, n] of Object.entries(t)) if (n) next[id] = clampFor(id, n * k);
      return next;
    });

  // keyboard: ↑/↓ choose a row, 1–4 size chips, +/− step, 0 close, D details
  const fi = Math.min(focus, Math.max(0, ids.length - 1));
  const focusId = ids[fi];
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || document.querySelector('[role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!focusId) return;
    const p = state.instruments[focusId];
    const cur = targets[focusId] ?? 0;
    const step = (p.archetype === 'pod' ? 0.1 : 0.05) * nav;
    let handled = true;
    if (e.key === 'ArrowDown' || e.key === 'j') setFocus(Math.min(ids.length - 1, fi + 1));
    else if (e.key === 'ArrowUp' || e.key === 'k') setFocus(Math.max(0, fi - 1));
    else if (['1', '2', '3', '4'].includes(e.key)) setTarget(focusId, clampFor(focusId, CHIPS[Number(e.key) - 1] * nav * (cur < 0 ? -1 : 1)));
    else if (e.key === '0' || e.key === 'x') setTarget(focusId, 0);
    else if (e.key === '+' || e.key === '=' || e.key === 'ArrowRight') setTarget(focusId, clampFor(focusId, cur + step));
    else if (e.key === '-' || e.key === 'ArrowLeft') setTarget(focusId, clampFor(focusId, cur - step));
    else if (e.key === 'd') onDetails(focusId);
    else handled = false;
    if (handled) e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${fi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [fi]);

  return (
    <Panel
      title="Trade blotter"
      right={
        <>
          <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={reset}>Undo changes</button>
          <button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={() => desk.universe.forEach((id) => targets[id] && setTarget(id, 0))}>Close all</button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-[12px]">
        <Kpi label="Positions" value={String(check.positions)} />
        <Kpi label="Gross" value={mult(check.gross / nav)} warn={check.gross > check.maxGross * nav} sub={`limit ${mult(check.maxGross, 0)}`} />
        <Kpi label="Net" value={mult(check.net / nav)} />
        <Kpi label="Margin" value={pct(check.margin / nav, 0)} warn={check.margin > 0.75 * nav} />
        <Kpi label="Trading cost" value={money(check.tradeCost)} />
      </div>
      <div className="flex flex-wrap items-center gap-1 mb-2">
        {([['all', `All ${desk.universe.length}`], ['held', `Book ${counts.held}`], ['new', `Trades ${counts.new}`], ['pods', `Pods ${counts.pods}`], ['hedges', `Hedges ${counts.hedges}`]] as [Filter, string][]).map(([f, l]) => (
          <button key={f} className={`btn text-[11px] px-2.5 py-1 ${filter === f ? 'btn-primary' : ''}`} onClick={() => { setFilter(f); setFocus(0); }}>{l}</button>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-muted mr-1">Scale book</span>
        {SCALES.map((k) => (
          <button key={k} className="btn text-[11px] px-2 py-1 num" onClick={() => scaleBook(k)} disabled={!check.positions} title={`Multiply every position by ${k}`}>×{k}</button>
        ))}
        <label className="flex items-center gap-1.5 text-[11px] text-ink2 ml-2" title="Show each trade's growth-optimal (Kelly) size given the rest of your book, from the desk's estimates">
          <input id="kelly-guide" type="checkbox" checked={showKelly} onChange={(e) => setShowKelly(e.target.checked)} /> Kelly guide
        </label>
      </div>
      {check.warnings.map((w) => <div key={w} className="text-[12px] text-warn mb-1">⚠ {w}</div>)}
      <div ref={listRef} className="divide-y divide-[var(--border)] border-y border-line">
        {ids.map((id, i) => (
          <Row
            key={id}
            idx={i}
            focused={i === fi}
            onFocus={() => setFocus(i)}
            state={state}
            p={state.instruments[id]}
            q={desk.quotes[id]}
            target={targets[id] ?? 0}
            base={baseline[id] ?? 0}
            setTarget={(n) => setTarget(id, clampFor(id, n))}
            limits={limitFor(id)}
            onDetails={() => onDetails(id)}
            truth={desk.truth?.[id]}
            impact={an.impact[id]}
            kelly={showKelly ? an.kelly[id] : undefined}
            q05={an.q05[id]}
          />
        ))}
        {!ids.length && <div className="py-4 text-muted text-[12px]">Nothing here.</div>}
      </div>
      <div className="text-[10.5px] text-muted mt-2 leading-snug">
        Sizes are % of NAV in gross notional. Keys: ↑/↓ choose a row · 1–4 set 5/10/25/50% · +/− step · 0 close · D details · Enter advance one week · Shift+Enter four weeks.
        The impact line on each order compares your book with and without it (desk model). The Kelly guide assumes the desk's estimates are right; most professionals run ¼–½ of it.
      </div>
    </Panel>
  );
}

function Row({ idx, focused, onFocus, state, p, q, target, base, setTarget, limits, onDetails, truth, impact, kelly, q05 }: {
  idx: number;
  focused: boolean;
  onFocus: () => void;
  state: GameState;
  p: InstrumentPublic;
  q: Quote;
  target: number;
  base: number;
  setTarget: (n: number) => void;
  limits: { maxN: number; minN: number };
  onDetails: () => void;
  truth?: number[];
  impact?: Impact;
  kelly?: number;
  q05?: number;
}) {
  const nav = state.nav;
  const info = ARCHETYPE_INFO[p.archetype];
  const held = base;
  const pos = state.positions[p.id];
  const canAdd = state.offered.includes(p.id) || !!pos;
  const { maxN, minN } = limits;
  const step = (p.archetype === 'pod' ? 0.1 : 0.05) * nav;
  const changed = Math.abs(target - held) >= 1;
  const left = p.expiresTurn - state.turn + 1;
  const tp = truth ? truth.reduce((a, x, k) => a + (p.outcomes[k].r > 0 ? x : 0), 0) : undefined;
  // dollar figures at the chosen size, or per 10% of NAV when not sized yet
  const n = target !== 0 ? target : 0.1 * nav;
  const sizeLabel = target !== 0 ? `at ${money(Math.abs(target))}` : 'per 10% NAV';
  const evUsd = n * q.ev;
  const badUsd = n >= 0 ? n * Math.min(0, q05 ?? q.worst) : n * q.best;
  const worstUsd = n >= 0 ? n * q.worst : n * q.best;
  let fi = 0;
  p.betaEst.forEach((b, k) => { if (Math.abs(b) > Math.abs(p.betaEst[fi])) fi = k; });
  const bet = Math.abs(p.betaEst[fi]) > 0.15 ? themeFor(FACTORS[fi], p.betaEst[fi] * (n >= 0 ? 1 : -1)).bet : p.archetype === 'event' ? 'a one-off event' : 'stock-specific moves';
  return (
    <div
      data-row={idx}
      onMouseDown={onFocus}
      className={`py-2 relative ${changed ? 'bg-[var(--accent-soft)] -mx-3 px-3' : ''}`}
      style={focused ? { boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
    >
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${focused && !changed ? 'pl-2' : ''}`}>
        <div className="flex items-center gap-2 min-w-[180px] flex-1 basis-[180px]">
          <span className="chip shrink-0 text-[9.5px]" style={{ color: info.color, borderColor: 'currentColor' }}>{info.short}</span>
          <button className="font-semibold text-[12.5px] truncate text-left hover:text-accent min-w-0" onClick={onDetails} title={`${p.name} — open full sizing analysis`}>{p.name}</button>
          {pos && <span className={`num text-[11px] shrink-0 ${toneClass(pos.pnl)}`}>{signedMoney(pos.pnl)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button className="btn px-2 py-1 text-[12px] num" onClick={() => setTarget(target - step)} disabled={target <= minN} aria-label={`Decrease ${p.name}`}>−</button>
          <input
            type="number"
            aria-label={`${p.name} size, % of NAV`}
            className="w-[58px] num text-right"
            step={p.archetype === 'pod' ? 10 : 5}
            value={Number(((target / nav) * 100).toFixed(1))}
            onChange={(e) => setTarget((Number(e.target.value) / 100) * nav)}
          />
          <button className="btn px-2 py-1 text-[12px] num" onClick={() => setTarget(target + step)} disabled={target >= maxN} aria-label={`Increase ${p.name}`}>+</button>
          {CHIPS.filter((c) => c * nav <= maxN + 1).map((c) => (
            <button key={c} className={`btn px-1.5 py-1 text-[11px] num ${Math.abs(target - c * nav) < 0.005 * nav ? 'btn-primary' : ''}`} onClick={() => setTarget(c * nav)} title={`Set to ${c * 100}% of NAV`}>{c * 100}%</button>
          ))}
          <button className="btn px-2 py-1 text-[11px]" onClick={() => setTarget(0)} disabled={target === 0}>Close</button>
          <button className="btn btn-ghost px-1.5 py-1 text-[11px]" onClick={onDetails}>Details</button>
        </div>
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 mt-1 text-[11px] num text-ink2 ${focused && !changed ? 'pl-2' : ''}`}>
        <span className="font-sans text-muted">{sizeLabel}</span>
        <span className="text-muted">·</span>
        <span className="font-sans text-muted">wins</span>
        <span className="w-[44px] inline-flex"><ProbBar lo={q.winLo} mid={q.win} hi={q.winHi} truth={tp} /></span>
        <span>{pct(q.win, 0)}</span>
        <span className="text-muted">·</span>
        <span className={toneClass(evUsd)}><span className="font-sans">expected</span> {signedMoney(evUsd)}/wk</span>
        <span className="text-muted">·</span>
        <span className="text-neg"><span className="font-sans">bad week</span> {signedMoney(badUsd)}</span>
        <span className="text-muted">·</span>
        <span className="text-neg"><span className="font-sans">worst</span> {signedMoney(worstUsd)}</span>
        {bet && <span className="font-sans text-muted">· bets on <span className="text-ink2">{bet}</span></span>}
        {p.expiresTurn < 1e8 && <span className="text-muted font-sans">· {left <= 1 ? 'last week' : `${left} weeks left`}</span>}
        {!canAdd && <span className="text-warn font-sans">· closed to new money</span>}
        {p.archetype === 'pod' && <span className="font-sans text-muted">· capacity {money(p.capacity)} · moves ≤{money(POD_PACE * nav)}/wk</span>}
        {kelly !== undefined && (
          <span className="font-sans">
            <span className="text-muted">· Kelly given book </span>
            <button className="num underline decoration-dotted hover:text-accent" onClick={() => setTarget(kelly * nav)} title="Set to full Kelly">{pct(kelly, 0)}</button>
            <span className="text-muted"> · ½K </span>
            <button className="num underline decoration-dotted hover:text-accent" onClick={() => setTarget((kelly / 2) * nav)} title="Set to half Kelly">{pct(kelly / 2, 0)}</button>
          </span>
        )}
      </div>
      <Evidence p={p} />
      {changed && (
        <div className="mt-1 text-[11px] num flex flex-wrap gap-x-2 text-ink2">
          <span className="text-warn font-sans">Order {held ? `${pct(held / nav, 1)} → ` : ''}{pct(target / nav, 1)}</span>
          {impact && (
            <>
              <span className="text-muted">·</span>
              <span title="Change in annualised portfolio volatility">book vol {impact.dVol >= 0 ? '+' : '−'}{pct(Math.abs(impact.dVol), 1)}</span>
              <span className="text-muted">·</span>
              <span className={toneClass(impact.dGrowth)} title="Change in expected compound growth per year">growth {impact.dGrowth >= 0 ? '+' : '−'}{pct(Math.abs(Math.exp(impact.dGrowth * 52) - 1), 1)}/yr</span>
              {Math.abs(impact.factorDelta) >= 1 && (
                <>
                  <span className="text-muted">·</span>
                  <span title="Largest factor exposure this order changes ($ per 1σ move)">{impact.factor} {impact.factorDelta >= 0 ? '+' : '−'}{money(Math.abs(impact.factorDelta))}/σ</span>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * How much the live results actually tell you: cumulative return, and a
 * t-statistic of the mean weekly return. Most streaks are noise.
 */
function Evidence({ p }: { p: InstrumentPublic }) {
  const live = p.live ?? [];
  const track = p.track ?? [];
  const n = live.length;
  const t = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
    return sd > 0 ? (m / sd) * Math.sqrt(xs.length) : 0;
  };
  const verdict = (tt: number) => (Math.abs(tt) < 1.5 ? ['probably noise', 'text-muted'] : Math.abs(tt) < 2.5 ? ['weak evidence', 'text-warn'] : ['strong evidence', tt > 0 ? 'text-pos' : 'text-neg']);
  if (n < 2 && !track.length) return null;
  const recent = live.slice(-4);
  const cum = (xs: number[]) => xs.reduce((a, x) => a * (1 + x), 1) - 1;
  const tLive = t(live);
  const [vl, vc] = verdict(tLive);
  const tTrack = t(track);
  // strategies that win small and lose big make t-stats look better than they are
  const worstR = Math.min(...p.outcomes.map((o) => o.r));
  const typical = p.outcomes.reduce((a, o) => a + Math.abs(o.r), 0) / p.outcomes.length;
  const negSkew = worstR < -3 * typical;
  const sharpe = track.length > 1 ? (tTrack / Math.sqrt(track.length)) * Math.sqrt(52) : 0;
  return (
    <div className="mt-0.5 text-[11px] num flex flex-wrap gap-x-2 text-ink2">
      {track.length > 0 && (
        <span title="Pre-game track record: annualised Sharpe and its t-statistic. Managers you meet are often the ones whose records happened to look good.">
          <span className="font-sans text-muted">{track.length}-wk record </span>Sharpe {sharpe.toFixed(1)} <span className="text-muted">(t {tTrack.toFixed(1)})</span>
        </span>
      )}
      {n >= 2 && (
        <span title="Live results since the game started. t = mean weekly return ÷ its standard error. Below ~2 it is hard to tell skill from luck.">
          {track.length > 0 && <span className="text-muted">· </span>}
          <span className="font-sans text-muted">live {n} wks </span>{cum(live) >= 0 ? '+' : ''}{(cum(live) * 100).toFixed(1)}%
          <span className="font-sans text-muted"> (last 4: {cum(recent) >= 0 ? '+' : ''}{(cum(recent) * 100).toFixed(1)}%)</span>
          <span className="text-muted"> · t {tLive.toFixed(1)} </span><span className={`font-sans ${vc}`}>{vl}</span>
          {negSkew && tLive > 1.5 && <span className="font-sans text-warn"> — but this payoff has a fat left tail the record may not have seen yet</span>}
        </span>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, warn, tone }: { label: string; value: string; sub?: string; warn?: boolean; tone?: string }) {
  return (
    <div>
      <div className="label text-[9.5px]">{label}</div>
      <div className={`num text-[14px] font-semibold ${warn ? 'text-neg' : tone ?? ''}`}>{value}{sub && <span className="text-[10.5px] text-muted font-normal ml-1">{sub}</span>}</div>
    </div>
  );
}

export function ProbBar({ lo, mid, hi, truth }: { lo: number; mid: number; hi: number; truth?: number }) {
  return (
    <div className="relative flex-1 h-2 rounded-full bg-panel2 min-w-[50px]" title={`95% band ${pct(lo, 0)}–${pct(hi, 0)}`}>
      <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--axis)' }} />
      <div className="absolute top-0 bottom-0 rounded-full" style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%`, background: 'color-mix(in oklab, var(--accent) 35%, transparent)' }} />
      <div className="absolute -top-0.5 -bottom-0.5 w-[3px] rounded" style={{ left: `calc(${mid * 100}% - 1.5px)`, background: 'var(--accent)' }} />
      {truth !== undefined && <div className="absolute -top-1 -bottom-1 w-[2px]" style={{ left: `${truth * 100}%`, background: 'var(--warn)' }} title={`True: ${pct(truth, 1)}`} />}
    </div>
  );
}

