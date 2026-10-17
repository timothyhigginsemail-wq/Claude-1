import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar as RBar, Cell } from 'recharts';
import { BENCH_IDS, BENCH_INFO, topRegime, type GameState, type TurnRecord } from '../../engine/game';
import { REGIME_SPECS } from '../../engine/market';
import { AXIS, GRID, Legend, SERIES, makeTooltip } from '../charts';
import { GradeBadge, Panel, Tabs } from '../kit';
import { money, num, pct, signedPct, toneClass } from '../format';

type BTab = 'perf' | 'history' | 'calib';
const BENCH_COLORS: Record<string, string> = { growth: SERIES[1], diversified: SERIES[2], fixed: SERIES[3], cash: 'var(--muted)' };

export function BottomPanel({ state, onOpenRecord }: { state: GameState; onOpenRecord: (r: TurnRecord) => void }) {
  const [tab, setTab] = useState<BTab>('perf');
  return (
    <Panel>
      <Tabs<BTab> tabs={[{ id: 'perf', label: 'Performance vs benchmarks' }, { id: 'history', label: 'Decision history' }, { id: 'calib', label: 'Probability calibration' }]} value={tab} onChange={setTab} />
      <div className="pt-3">
        {tab === 'perf' && <Performance state={state} />}
        {tab === 'history' && <History state={state} onOpen={onOpenRecord} />}
        {tab === 'calib' && <Calibration state={state} />}
      </div>
    </Panel>
  );
}

export function equityData(state: GameState) {
  return state.navPath.map((v, t) => {
    const row: Record<string, number> = { t, you: v / state.config.startNav };
    for (const b of BENCH_IDS) row[b] = (state.bench[b].path[t] ?? NaN) / state.config.startNav;
    let peak = 0;
    for (let k = 0; k <= t; k++) peak = Math.max(peak, state.navPath[k]);
    row.dd = -(1 - v / peak);
    return row;
  });
}

export function Performance({ state, height = 220 }: { state: GameState; height?: number }) {
  const data = equityData(state);
  if (data.length < 2) return <div className="text-muted text-[12px] py-6 text-center">Your equity curve will appear here after the first turn. Benchmarks trade the same opportunities with the same information you had.</div>;
  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
      <div>
        <div style={{ height }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={50} domain={['auto', 'auto']} tickFormatter={(v) => `${((v - 1) * 100).toFixed(0)}%`} />
              <Tooltip content={makeTooltip((l) => `Turn ${l}`, (v) => signedPct(v - 1, 1))} />
              <ReferenceLine y={1} stroke="var(--axis)" />
              {BENCH_IDS.map((b) => (
                <Line key={b} dataKey={b} name={BENCH_INFO[b].name} stroke={BENCH_COLORS[b]} strokeWidth={1.5} strokeDasharray={b === 'cash' ? '3 3' : undefined} dot={false} isAnimationActive={false} />
              ))}
              <Line dataKey="you" name="You" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'You', color: 'var(--c1)' }, ...BENCH_IDS.map((b) => ({ label: BENCH_INFO[b].name, color: BENCH_COLORS[b], dash: b === 'cash' }))]} />
      </div>
      <div>
        <div className="label mb-1">Your drawdown</div>
        <div style={{ height: height * 0.6 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={42} tickFormatter={(v) => pct(v, 0)} domain={[(min: number) => Math.min(min, -0.05), 0]} />
              <Tooltip content={makeTooltip((l) => `Turn ${l}`, (v) => pct(v, 1))} />
              <Area dataKey="dd" name="Drawdown" stroke="var(--neg-fill)" fill="var(--neg-fill)" fillOpacity={0.25} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[11px] text-muted mt-2 space-y-0.5">
          {BENCH_IDS.map((b) => (
            <div key={b} className="flex justify-between" title={BENCH_INFO[b].desc}><span>{BENCH_INFO[b].name}</span><span className="num">{money(state.bench[b].nav)}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function History({ state, onOpen }: { state: GameState; onOpen: (r: TurnRecord) => void }) {
  if (!state.history.length) return <div className="text-muted text-[12px] py-4">No turns played yet.</div>;
  return (
    <div className="overflow-x-auto scroll-thin max-h-[320px]">
      <table className="w-full text-[12px]">
        <thead className="text-muted text-left sticky top-0 bg-panel">
          <tr>
            <th className="py-1 pr-2 font-medium">Turn</th>
            <th className="pr-2 font-medium text-center">Decision</th>
            <th className="pr-2 font-medium text-right">Return</th>
            <th className="pr-2 font-medium text-right">NAV</th>
            <th className="pr-2 font-medium text-right">Size vs Kelly</th>
            <th className="pr-2 font-medium text-right">Positions</th>
            <th className="pr-2 font-medium">Regime read after</th>
            <th className="pr-2 font-medium">Events</th>
          </tr>
        </thead>
        <tbody>
          {state.history.slice().reverse().map((r) => (
            <tr key={r.turn} className="border-t border-line hover:bg-panel2 cursor-pointer" onClick={() => onOpen(r)}>
              <td className="py-1.5 pr-2 num">{r.turn}</td>
              <td className="pr-2 text-center"><GradeBadge letter={r.grade.letter} size="sm" /></td>
              <td className={`pr-2 num text-right ${toneClass(r.ret)}`}>{signedPct(r.ret, 2)}</td>
              <td className="pr-2 num text-right">{money(r.navAfter)}</td>
              <td className="pr-2 num text-right">{r.exAnte.heldIds.length ? `${num(Math.min(r.exAnte.sizing, 99), 2)}×` : '—'}</td>
              <td className="pr-2 num text-right">{r.positions.length}</td>
              <td className="pr-2 text-ink2">{REGIME_SPECS[topRegime(r.beliefAfter)].name}</td>
              <td className="pr-2 text-[11px] text-ink2 max-w-[280px] truncate">{r.events.map((e) => e.text).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Calibration({ state }: { state: GameState }) {
  const cal = state.calibration;
  if (cal.length < 3) return <div className="text-muted text-[12px] py-4">Calibration needs a few resolved trades. Record "Your estimate" of P(win) on trades to track your own calibration.</div>;
  const bins = [0, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01];
  const mk = (get: (c: (typeof cal)[number]) => number | undefined) =>
    bins.slice(0, -1).map((lo, i) => {
      const hi = bins[i + 1];
      const xs = cal.filter((c) => {
        const v = get(c);
        return v !== undefined && v >= lo && v < hi;
      });
      return { bin: `${(lo * 100).toFixed(0)}–${Math.min(100, hi * 100).toFixed(0)}%`, mid: xs.length ? xs.reduce((a, c) => a + get(c)!, 0) / xs.length : NaN, freq: xs.length ? xs.filter((c) => c.won).length / xs.length : NaN, n: xs.length };
    });
  const desk = mk((c) => c.quoted);
  const user = mk((c) => c.user);
  const userN = cal.filter((c) => c.user !== undefined).length;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <div className="text-[12px] text-ink2 mb-2">Quoted win probability vs. realised win frequency (all resolved position-turns). A calibrated forecaster's bars sit on the diagonal. Small samples are noisy — that is itself the lesson.</div>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <ComposedChart data={desk.map((d, i) => ({ ...d, user: user[i].freq, userMid: user[i].mid }))} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="bin" {...AXIS} />
              <YAxis domain={[0, 1]} {...AXIS} width={40} tickFormatter={(v) => pct(v, 0)} />
              <Tooltip content={makeTooltip((l) => `Quoted ${l}`, (v) => pct(v, 0))} />
              <RBar dataKey="freq" name="Desk: realised freq." fill="var(--c1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {desk.map((_, i) => <Cell key={i} fill="var(--c1)" />)}
              </RBar>
              {userN > 0 && <RBar dataKey="user" name="You: realised freq." fill="var(--c2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
              <Line dataKey="mid" name="Desk: avg quoted" stroke="var(--text-2)" strokeDasharray="3 3" dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="text-[12px] text-ink2 space-y-2">
        <div><b className="text-ink">{cal.length}</b> resolved position-turns, of which <b className="text-ink">{userN}</b> carry your own estimate.</div>
        <div>Desk average quoted P(win): <b className="num text-ink">{pct(cal.reduce((a, c) => a + c.quoted, 0) / cal.length, 1)}</b> · realised: <b className="num text-ink">{pct(cal.filter((c) => c.won).length / cal.length, 1)}</b></div>
        {userN > 0 && (
          <div>Your average estimate: <b className="num text-ink">{pct(cal.filter((c) => c.user !== undefined).reduce((a, c) => a + c.user!, 0) / userN, 1)}</b> · realised on those: <b className="num text-ink">{pct(cal.filter((c) => c.user !== undefined && c.won).length / userN, 1)}</b></div>
        )}
        <div className="text-muted text-[11px]">True probabilities stay hidden until the campaign ends; the final review decomposes your P&L into estimation error and luck.</div>
      </div>
    </div>
  );
}

export { topRegime };
