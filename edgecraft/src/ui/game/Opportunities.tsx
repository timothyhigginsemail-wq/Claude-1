import type { GameState } from '../../engine/game';
import { ARCHETYPE_INFO, winProb, type InstrumentPublic } from '../../engine/instruments';
import { FACTORS } from '../../engine/market';
import type { Quote } from '../../engine/risk';
import { Panel } from '../kit';
import { bp, money, pct } from '../format';
import type { Desk } from './useDesk';

export function OpportunityList({ state, desk, targets, selected, onSelect }: { state: GameState; desk: Desk; targets: Record<string, number>; selected: string | null; onSelect: (id: string) => void }) {
  const groups: { title: string; ids: string[] }[] = [];
  const held = desk.universe.filter((id) => state.positions[id]);
  const fresh = desk.universe.filter((id) => !state.positions[id] && state.instruments[id].createdTurn === state.turn && !['future', 'pod'].includes(state.instruments[id].archetype));
  const older = desk.universe.filter((id) => !state.positions[id] && state.instruments[id].createdTurn < state.turn && !['future', 'pod'].includes(state.instruments[id].archetype));
  const pods = desk.universe.filter((id) => !state.positions[id] && state.instruments[id].archetype === 'pod');
  const futures = desk.universe.filter((id) => !state.positions[id] && state.instruments[id].archetype === 'future');
  if (pods.length) groups.push({ title: 'Strategy pods', ids: pods });
  if (fresh.length) groups.push({ title: state.config.level === 1 ? 'This turn\'s opportunities' : 'New opportunities', ids: fresh });
  if (older.length) groups.push({ title: 'Still open (last turn)', ids: older });
  if (held.length) groups.push({ title: 'Your positions', ids: held });
  if (futures.length) groups.push({ title: 'Hedging instruments', ids: futures });
  return (
    <Panel title="Opportunities" right={<span className="text-[11px] text-muted">desk estimates · next turn</span>}>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="text-[11px] text-muted mb-1.5 font-semibold">{g.title}</div>
            <div className="space-y-2">
              {g.ids.map((id) => (
                <OppCard
                  key={id}
                  p={state.instruments[id]}
                  q={desk.quotes[id]}
                  turn={state.turn}
                  target={targets[id] ?? 0}
                  held={state.positions[id]?.notional ?? 0}
                  nav={state.nav}
                  selected={selected === id}
                  truth={desk.truth?.[id]}
                  onClick={() => onSelect(id)}
                />
              ))}
            </div>
          </div>
        ))}
        {!groups.length && <div className="text-muted text-[12px]">No opportunities this turn.</div>}
      </div>
    </Panel>
  );
}

function OppCard({ p, q, turn, target, held, nav, selected, truth, onClick }: { p: InstrumentPublic; q: Quote; turn: number; target: number; held: number; nav: number; selected: boolean; truth?: number[]; onClick: () => void }) {
  const info = ARCHETYPE_INFO[p.archetype];
  const left = p.expiresTurn - turn + 1;
  const topF = p.betaEst.map((b, i) => ({ f: FACTORS[i], b })).sort((a, b) => Math.abs(b.b) - Math.abs(a.b)).filter((x) => Math.abs(x.b) > 0.12).slice(0, 3);
  const pending = Math.abs(target - held) >= 1;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border px-2.5 py-2 transition-colors"
      style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', background: selected ? 'var(--accent-soft)' : 'var(--panel)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[12.5px] truncate">{p.name}</span>
        <span className="chip shrink-0" style={{ color: info.color, borderColor: 'currentColor' }}>{info.short}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 mt-1.5 items-end">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted w-[46px] shrink-0">P(win)</span>
            <ProbBar lo={q.winLo} mid={q.win} hi={q.winHi} truth={truth ? winProb(p.outcomes, truth) : undefined} />
            <span className="num shrink-0">{pct(q.win, 0)}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] num text-ink2">
            <span className="text-muted w-[46px] shrink-0 font-sans">EV/$</span>
            <span className={q.ev >= 0 ? 'text-pos' : 'text-neg'}>{q.ev >= 0 ? '+' : ''}{bp(q.ev, 0)}</span>
            <span className="text-muted">[{bp(q.evLo, 0)}, {bp(q.evHi, 0)}]</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] num text-ink2">
            <span className="text-muted w-[46px] shrink-0 font-sans">Worst</span>
            <span className="text-neg">{pct(q.worst, 1)}</span>
            <span className="text-muted font-sans">best</span>
            <span className="text-pos">+{pct(q.best, 1)}</span>
          </div>
        </div>
        <MiniDist p={p} probs={q.probs} />
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {topF.map((x) => (
          <span key={x.f} className="chip text-[9.5px]">{x.f} {x.b > 0 ? '+' : '−'}{Math.abs(x.b).toFixed(2)}</span>
        ))}
        {p.expiresTurn < 1e8 && <span className="chip text-[9.5px]">{left <= 1 ? 'resolves this turn' : `${left} turns left`}</span>}
        {p.research.signal && p.researchCost.signal > 0 && <span className="chip text-[9.5px]" style={{ color: 'var(--accent)' }}>researched</span>}
        {p.group === 'ten' && <span className="chip text-[9.5px]">new strategy</span>}
        {held !== 0 && <span className="chip text-[9.5px]" style={{ color: 'var(--text)' }}>held {money(held)}</span>}
        {pending && <span className="chip text-[9.5px]" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>→ {money(target)}{nav ? ` (${pct(target / nav, 0)})` : ''}</span>}
      </div>
    </button>
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

function MiniDist({ p, probs }: { p: InstrumentPublic; probs: number[] }) {
  const W = 64, H = 34;
  const max = Math.max(...probs);
  const n = probs.length;
  const bw = W / n - 2;
  return (
    <svg width={W} height={H} aria-hidden className="shrink-0">
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--axis)" />
      {probs.map((q, k) => {
        const h = Math.max(1.5, (q / max) * (H - 3));
        return <rect key={k} x={k * (W / n) + 1} y={H - h - 1} width={bw} height={h} rx={1.5} fill={p.outcomes[k].r >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} opacity={0.85} />;
      })}
    </svg>
  );
}
