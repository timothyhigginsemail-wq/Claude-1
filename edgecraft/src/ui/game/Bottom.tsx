import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar as RBar, Cell } from 'recharts';
import { BENCH_IDS, BENCH_INFO, GHOSTS, topRegime, type GameState, type TurnRecord } from '../../engine/game';
import { REGIME_SPECS } from '../../engine/market';
import { AXIS, GRID, Legend, SERIES, makeTooltip } from '../charts';
import { GradeBadge, Panel, Tabs } from '../kit';
import { money, num, pct, signedPct, toneClass } from '../format';

type BTab = 'luck' | 'ghosts' | 'perf' | 'history' | 'calib';
const BENCH_COLORS: Record<string, string> = { growth: SERIES[1], diversified: SERIES[2], fixed: SERIES[3], cash: 'var(--muted)' };

export function BottomPanel({ state, onOpenRecord }: { state: GameState; onOpenRecord: (r: TurnRecord) => void }) {
  const [tab, setTab] = useState<BTab>('luck');
  return (
    <Panel>
      <Tabs<BTab> tabs={[{ id: 'luck', label: 'Skill vs luck' }, { id: 'ghosts', label: 'Same trades, other sizes' }, { id: 'perf', label: 'Vs benchmarks' }, { id: 'history', label: 'Decision history' }, { id: 'calib', label: 'Probability calibration' }]} value={tab} onChange={setTab} />
      <div className="pt-3">
        {tab === 'luck' && <SkillVsLuck state={state} />}
        {tab === 'ghosts' && <Ghosts state={state} />}
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

/**
 * Cumulative expected log growth (what your decisions were worth, desk model)
 * vs. realised log growth, with a ±1σ band from the ex-ante volatility.
 */
export function SkillVsLuck({ state, height = 220 }: { state: GameState; height?: number }) {
  const h = state.history;
  if (!h.length) return <div className="text-muted text-[12px] py-6 text-center">After a few weeks this shows how much of your result was expected from your decisions, and how much was luck.</div>;
  let e = 0, r = 0, v = 0;
  const data = [{ t: 0, exp: 0, real: 0, band: [0, 0] as [number, number] }];
  for (const x of h) {
    e += x.exAnte.elog;
    r += x.logRet;
    v += x.exAnte.vol * x.exAnte.vol;
    const sd = Math.sqrt(v);
    data.push({ t: x.turn, exp: Math.exp(e) - 1, real: Math.exp(r) - 1, band: [Math.exp(e - sd) - 1, Math.exp(e + sd) - 1] });
  }
  const luck = Math.exp(r - e) - 1;
  const z = v > 0 ? (r - e) / Math.sqrt(v) : 0;
  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
      <div>
        <div style={{ height }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={50} domain={['auto', 'auto']} tickFormatter={(x) => pct(x, 0)} />
              <Tooltip content={makeTooltip((l) => `Week ${l}`, (x) => signedPct(x, 1))} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Area dataKey="band" name="Expected ±1σ" stroke="none" fill="var(--c3)" fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="exp" name="Expected (your decisions)" stroke="var(--c3)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
              <Line dataKey="real" name="Realised" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Realised', color: 'var(--c1)' }, { label: 'Expected from your decisions', color: 'var(--c3)', dash: true }]} />
      </div>
      <div className="text-[12px] text-ink2 space-y-2 leading-relaxed">
        <div>Expected compound return of the books you chose: <b className="num text-ink">{signedPct(Math.exp(e) - 1, 1)}</b></div>
        <div>Realised: <b className={`num ${toneClass(r)}`}>{signedPct(Math.exp(r) - 1, 1)}</b></div>
        <div>Luck (realised vs. expected): <b className={`num ${toneClass(luck)}`}>{signedPct(luck, 1)}</b> · <span className="num">{z >= 0 ? '+' : ''}{z.toFixed(1)}σ</span></div>
        <div className="text-muted text-[11px]">The dashed line is what your sizing and selection were worth under the desk's estimates; the shaded band is the normal range of luck around it. Inside the band, the result says little about skill. Expectations use the desk's quotes, which can be optimistic — the end review reveals how optimistic.</div>
      </div>
    </div>
  );
}

/** Your exact trades at ½× and 2× size, run on the same market path. */
export function Ghosts({ state, height = 220 }: { state: GameState; height?: number }) {
  const g = state.ghosts;
  if (!g || state.navPath.length < 2) return <div className="text-muted text-[12px] py-6 text-center">After the first week this shows your exact trades run at half and double your size on the same market — the cleanest test of whether your sizing helped.</div>;
  const s0 = state.config.startNav;
  const data = state.navPath.map((v, t) => ({ t, you: v / s0 - 1, half: (g.half.path[t] ?? NaN) / s0 - 1, double: (g.double.path[t] ?? NaN) / s0 - 1 }));
  const fin = (x: number) => x / s0 - 1;
  const best = [['½ size', fin(g.half.nav)], ['your size', fin(state.nav)], ['2× size', fin(g.double.nav)]].reduce((a, b) => ((b[1] as number) > (a[1] as number) ? b : a));
  const dd = (path: number[]) => { let pk = 0, m = 0; for (const x of path) { pk = Math.max(pk, x); m = Math.max(m, 1 - x / pk); } return m; };
  return (
    <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
      <div>
        <div style={{ height }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={50} domain={['auto', 'auto']} tickFormatter={(x) => pct(x, 0)} />
              <Tooltip content={makeTooltip((l) => `Week ${l}`, (x) => signedPct(x, 1))} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Line dataKey="half" name={GHOSTS[0].name} stroke="var(--c3)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line dataKey="double" name={GHOSTS[1].name} stroke="var(--c2)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line dataKey="you" name="You" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'You', color: 'var(--c1)' }, { label: GHOSTS[0].name, color: 'var(--c3)' }, { label: GHOSTS[1].name, color: 'var(--c2)' }]} />
      </div>
      <table className="text-[12px] self-start w-full">
        <thead className="text-muted"><tr><th className="text-left font-medium py-1">Same trades at</th><th className="text-right font-medium">Return</th><th className="text-right font-medium">Max DD</th></tr></thead>
        <tbody>
          <tr className="border-t border-line"><td className="py-1.5">½ your size</td><td className={`num text-right ${toneClass(fin(g.half.nav))}`}>{signedPct(fin(g.half.nav), 1)}</td><td className="num text-right">{pct(dd(g.half.path), 1)}</td></tr>
          <tr className="border-t border-line font-semibold"><td className="py-1.5">Your size</td><td className={`num text-right ${toneClass(fin(state.nav))}`}>{signedPct(fin(state.nav), 1)}</td><td className="num text-right">{pct(dd(state.navPath), 1)}</td></tr>
          <tr className="border-t border-line"><td className="py-1.5">2× your size</td><td className={`num text-right ${toneClass(fin(g.double.nav))}`}>{signedPct(fin(g.double.nav), 1)}</td><td className="num text-right">{pct(dd(g.double.path), 1)}</td></tr>
          <tr><td colSpan={3} className="pt-2 text-[11px] text-muted leading-snug">So far, <b className="text-ink2">{best[0]}</b> did best. Bigger is better only while you are below the growth optimum; past it, doubling adds risk and subtracts growth. Over a few weeks luck dominates — watch the gap over 20+ weeks.</td></tr>
        </tbody>
      </table>
    </div>
  );
}
