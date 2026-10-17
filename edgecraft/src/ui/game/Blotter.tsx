import { useState } from 'react';
import type { GameState, OrderCheck } from '../../engine/game';
import { ARCHETYPE_INFO, type InstrumentPublic } from '../../engine/instruments';
import type { Quote } from '../../engine/risk';
import { Panel } from '../kit';
import { bp, money, mult, pct, signedMoney, toneClass } from '../format';
import type { Desk } from './useDesk';

type Filter = 'all' | 'held' | 'new' | 'pods' | 'hedges';

const CHIPS = [0.05, 0.1, 0.25, 0.5];

/** One row per tradable instrument with one-click sizing: the fast way to build a book. */
export function Blotter({ state, desk, targets, setTarget, onDetails, check, reset }: {
  state: GameState;
  desk: Desk;
  targets: Record<string, number>;
  setTarget: (id: string, n: number) => void;
  onDetails: (id: string) => void;
  check: OrderCheck;
  reset: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const nav = state.nav;
  const kind = (p: InstrumentPublic) => (p.archetype === 'pod' ? 'pods' : p.archetype === 'future' || p.archetype === 'tailhedge' ? 'hedges' : 'new');
  const rank = (id: string) => {
    const p = state.instruments[id];
    if (state.positions[id] || targets[id]) return 0;
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
  const expPnl = desk.universe.reduce((a, id) => a + (targets[id] ?? 0) * (desk.quotes[id]?.ev ?? 0), 0);

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
        <Kpi label="Exp. P&L / week" value={signedMoney(expPnl)} tone={toneClass(expPnl)} />
        <Kpi label="Trading cost" value={money(check.tradeCost)} />
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {([['all', `All ${desk.universe.length}`], ['held', `Book ${counts.held}`], ['new', `Trades ${counts.new}`], ['pods', `Pods ${counts.pods}`], ['hedges', `Hedges ${counts.hedges}`]] as [Filter, string][]).map(([f, l]) => (
          <button key={f} className={`btn text-[11px] px-2.5 py-1 ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>{l}</button>
        ))}
      </div>
      {check.warnings.map((w) => <div key={w} className="text-[12px] text-warn mb-1">⚠ {w}</div>)}
      <div className="divide-y divide-[var(--border)] border-y border-line">
        {ids.map((id) => (
          <Row key={id} state={state} p={state.instruments[id]} q={desk.quotes[id]} target={targets[id] ?? 0} setTarget={(n) => setTarget(id, n)} onDetails={() => onDetails(id)} truth={desk.truth?.[id]} />
        ))}
        {!ids.length && <div className="py-4 text-muted text-[12px]">Nothing here.</div>}
      </div>
      <div className="text-[10.5px] text-muted mt-2 leading-snug">
        Sizes are % of NAV in gross notional. Click a chip to set a size, use − / + to step, or type a number. Orders execute when you advance the market. "Details" opens the full sizing analysis.
      </div>
    </Panel>
  );
}

function Row({ state, p, q, target, setTarget, onDetails, truth }: {
  state: GameState;
  p: InstrumentPublic;
  q: Quote;
  target: number;
  setTarget: (n: number) => void;
  onDetails: () => void;
  truth?: number[];
}) {
  const nav = state.nav;
  const info = ARCHETYPE_INFO[p.archetype];
  const held = state.positions[p.id]?.notional ?? 0;
  const pos = state.positions[p.id];
  const canAdd = state.offered.includes(p.id) || !!pos;
  const maxN = canAdd ? p.maxPctNav * nav : Math.abs(held);
  const minN = p.allowShort ? -maxN : 0;
  const step = (p.archetype === 'pod' ? 0.1 : 0.05) * nav;
  const clamp = (n: number) => Math.round(Math.max(minN, Math.min(maxN, n)));
  const changed = Math.abs(target - held) >= 1;
  const left = p.expiresTurn - state.turn + 1;
  const tp = truth ? truth.reduce((a, x, k) => a + (p.outcomes[k].r > 0 ? x : 0), 0) : undefined;
  return (
    <div className={`py-2 ${changed ? 'bg-[var(--accent-soft)] -mx-3 px-3' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-[180px] flex-1 basis-[180px]">
          <span className="chip shrink-0 text-[9.5px]" style={{ color: info.color, borderColor: 'currentColor' }}>{info.short}</span>
          <button className="font-semibold text-[12.5px] truncate text-left hover:text-accent min-w-0" onClick={onDetails} title={`${p.name} — open full sizing analysis`}>{p.name}</button>
          {pos && <span className={`num text-[11px] shrink-0 ${toneClass(pos.pnl)}`}>{signedMoney(pos.pnl)}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button className="btn px-2 py-1 text-[12px] num" onClick={() => setTarget(clamp(target - step))} disabled={target <= minN} aria-label={`Decrease ${p.name}`}>−</button>
          <input
            type="number"
            aria-label={`${p.name} size, % of NAV`}
            className="w-[58px] num text-right"
            step={p.archetype === 'pod' ? 10 : 5}
            value={Number(((target / nav) * 100).toFixed(1))}
            onChange={(e) => setTarget(clamp((Number(e.target.value) / 100) * nav))}
          />
          <button className="btn px-2 py-1 text-[12px] num" onClick={() => setTarget(clamp(target + step))} disabled={target >= maxN} aria-label={`Increase ${p.name}`}>+</button>
          {CHIPS.filter((c) => c * nav <= maxN + 1).map((c) => (
            <button key={c} className={`btn px-1.5 py-1 text-[11px] num ${Math.abs(target - c * nav) < 0.005 * nav ? 'btn-primary' : ''}`} onClick={() => setTarget(clamp(c * nav))} title={`Set to ${c * 100}% of NAV`}>{c * 100}%</button>
          ))}
          <button className="btn px-2 py-1 text-[11px]" onClick={() => setTarget(0)} disabled={target === 0}>Close</button>
          <button className="btn btn-ghost px-1.5 py-1 text-[11px]" onClick={onDetails}>Details</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 mt-1 text-[11px] num text-ink2">
        <span className="font-sans text-muted">P(win)</span>
        <span className="w-[54px] inline-flex"><ProbBar lo={q.winLo} mid={q.win} hi={q.winHi} truth={tp} /></span>
        <span>{pct(q.win, 0)}</span>
        <span className="text-muted">·</span>
        <span className={q.ev >= 0 ? 'text-pos' : 'text-neg'}>EV {q.ev >= 0 ? '+' : ''}{bp(q.ev, 0)}/wk</span>
        <span className="text-muted">·</span>
        <span className="text-neg">worst {pct(q.worst, 1)}</span>
        {p.expiresTurn < 1e8 && <span className="text-muted font-sans">· {left <= 1 ? 'last week' : `${left} weeks left`}</span>}
        {!canAdd && <span className="text-warn font-sans">· closed to new money</span>}
        {changed && <span className="text-warn font-sans">· order: {held ? `${pct(held / nav, 0)} → ` : ''}{pct(target / nav, 1)}</span>}
      </div>
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

