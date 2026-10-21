import { Bar as RBar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { HISTORY, estimate, type AllocState, type PM } from '../../engine/allocator';
import { AXIS, GRID, makeTooltip } from '../charts';
import { Modal } from '../kit';
import { num, pct, signedPct } from '../format';
import { verdict } from './analytics';

export function PMDetail({ pm, state, onClose }: { pm: PM; state: AllocState; onClose: () => void }) {
  const e = estimate(pm);
  const xs = [...pm.track, ...pm.live];
  const start = pm.pitchWeek - HISTORY;
  let v = 1;
  let peak = 1;
  const data = xs.map((r, i) => {
    v *= 1 + r;
    peak = Math.max(peak, v);
    const w = xs.slice(Math.max(0, i - 25), i + 1);
    const m = w.reduce((a, x) => a + x, 0) / w.length;
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, w.length - 1));
    return { w: start + i, cum: v - 1, dd: -(1 - v / peak), roll: i >= 25 && sd > 0 ? (m / sd) * Math.sqrt(52) : null, r };
  });
  // histogram of weekly returns
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const bins = 21;
  const hist = Array.from({ length: bins }, (_, k) => ({ x: lo + ((k + 0.5) * (hi - lo)) / bins, n: 0 }));
  for (const x of xs) hist[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo || 1)) * bins))].n++;
  const lv = verdict(e.liveT);
  return (
    <Modal open wide onClose={onClose} title={<span>{pm.name} · {pm.style}</span>} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <p className="text-[13px] text-ink2 mb-3">{pm.blurb}</p>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <S l="Skill estimate" v={num(e.sr, 2)} s={`90%: ${num(e.lo, 1)} to ${num(e.hi, 1)}`} />
        <S l="Raw record Sharpe" v={num(e.srRaw, 2)} s={`± ${num(e.se, 2)} (1 s.e.)`} />
        <S l="Volatility" v={pct(e.vol, 1)} s="annualised" />
        <S l="Max drawdown" v={pct(e.maxDD, 1)} s={`worst week ${pct(e.worstWeek, 1)}`} />
        <S l="Live since pitch" v={signedPct(e.liveRet, 1)} s={`${pm.live.length} weeks · ${pm.live.length > 1 ? lv.label : 'no data yet'}`} />
        <S l="Capacity" v={`$${(pm.capacity / 1e6).toFixed(0)}M`} s="above this, returns dilute" />
      </div>
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <div>
          <div className="label mb-1">Cumulative return · the dashed line is the pitch</div>
          <div className="h-[230px]">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="w" {...AXIS} />
                <YAxis {...AXIS} width={48} tickFormatter={(x) => pct(x, 0)} />
                <Tooltip content={makeTooltip((l) => `Week ${l}`, (x) => signedPct(x, 1))} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <ReferenceLine x={pm.pitchWeek} stroke="var(--muted)" strokeDasharray="4 3" />
                {pm.hiredWeek !== undefined && <ReferenceLine x={pm.hiredWeek} stroke="var(--c3)" strokeDasharray="2 2" label={{ value: 'hired', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />}
                <Line dataKey="cum" name="Cumulative" stroke="var(--c1)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line dataKey="dd" name="Drawdown" stroke="var(--neg-fill)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="label mb-1 mt-3">Rolling 26-week Sharpe · how unstable short windows are</div>
          <div className="h-[130px]">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="w" {...AXIS} />
                <YAxis {...AXIS} width={48} tickFormatter={(x) => num(x, 1)} />
                <Tooltip content={makeTooltip((l) => `Week ${l}`, (x) => num(x, 2))} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <ReferenceLine x={pm.pitchWeek} stroke="var(--muted)" strokeDasharray="4 3" />
                <Line dataKey="roll" name="26w Sharpe" stroke="var(--c7)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="label mb-1">Distribution of weekly returns</div>
          <div className="h-[200px]">
            <ResponsiveContainer>
              <ComposedChart data={hist} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="x" {...AXIS} tickFormatter={(x) => pct(Number(x), 1)} />
                <YAxis {...AXIS} width={30} />
                <Tooltip content={makeTooltip((l) => `≈ ${pct(Number(l), 2)}`, (x) => `${x} weeks`)} />
                <RBar dataKey="n" name="Weeks" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {hist.map((h, i) => <Cell key={i} fill={h.x >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} />)}
                </RBar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[12px] text-ink2 mt-3 space-y-2 leading-relaxed">
            <p>A Sharpe estimated from {xs.length} weeks has a standard error of about <b className="num text-ink">{num(e.se, 2)}</b>. The skill estimate pulls the record toward what a typical pitching PM delivers, because you only meet managers whose records look good.</p>
            {e.negSkew && <p className="text-warn">This style wins small and loses big. A calm record can hide the tail; a single crisis week can be several months of gains.</p>}
            <p className="text-muted text-[11px]">Market weeks run on the platform's calendar; negative weeks are before you opened (week 0). Current week: {state.week}.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function S({ l, v, s }: { l: string; v: string; s?: string }) {
  return (
    <div className="bg-panel2 rounded-md px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{l}</div>
      <div className="num text-[14px] font-semibold">{v}</div>
      {s && <div className="text-[10px] text-muted">{s}</div>}
    </div>
  );
}
