// The Experiment Lab: twelve interactive lessons. Every number on screen is
// computed (exactly, or by seeded Monte Carlo) from the slider values.

import { useMemo, useState, type ComponentType } from 'react';
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AXIS, GRID, Legend, SERIES, divergingColor, makeTooltip } from '../ui/charts';
import { Slider, Readout, Explain, Layout } from './common';
import { expectedLogGrowth, kellyBinary, kellyDiscrete, kellyMeanVariance } from '../engine/kelly';
import { binomPmf } from '../engine/math';
import { Rng } from '../engine/rng';
import { MathBlock } from '../ui/kit';
import { money, num, pct, signedPct } from '../ui/format';

type P = { compact?: boolean };
const H = (compact?: boolean) => (compact ? 210 : 260);

// ---------------------------------------------------------------- 1
function KellyCoin({ compact }: P) {
  const [p, setP] = useState(0.55);
  const [f, setF] = useState(0.1);
  const [n, setN] = useState(300);
  const [seed, setSeed] = useState(1);
  const fStar = Math.max(0, kellyBinary(p, 1));
  const o = [{ r: 1, p }, { r: -1, p: 1 - p }];
  const curve = useMemo(() => Array.from({ length: 81 }, (_, i) => {
    const x = (i / 80) * 0.6;
    const g = expectedLogGrowth(x, o);
    return { f: x, g: isFinite(g) ? Math.max(g, -0.06) : -0.06, er: x * (2 * p - 1) };
  }), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => {
    const rng = new Rng('lab1', seed);
    const P = 25;
    const flips = Array.from({ length: P }, () => Array.from({ length: n }, () => rng.next() < p));
    const rows: Record<string, number>[] = [];
    const w = new Array(P).fill(1);
    const wk = new Array(P).fill(1);
    for (let t = 0; t <= n; t++) {
      if (t > 0) for (let k = 0; k < P; k++) {
        w[k] *= flips[k][t - 1] ? 1 + f : 1 - f;
        wk[k] *= flips[k][t - 1] ? 1 + fStar : 1 - fStar;
      }
      if (t % Math.max(1, Math.floor(n / 120)) === 0 || t === n) {
        const row: Record<string, number> = { t };
        for (let k = 0; k < P; k++) row[`p${k}`] = Math.log10(Math.max(w[k], 1e-6));
        const s = w.slice().sort((a, b) => a - b);
        const sk = wk.slice().sort((a, b) => a - b);
        row.med = Math.log10(Math.max(s[Math.floor(P / 2)], 1e-6));
        row.medK = Math.log10(Math.max(sk[Math.floor(P / 2)], 1e-6));
        rows.push(row);
      }
    }
    return rows;
  }, [p, f, n, seed, fStar]);
  const g = expectedLogGrowth(f, o);
  const gStar = expectedLogGrowth(fStar, o);
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Win probability p" value={p} min={0.45} max={0.75} step={0.01} onChange={setP} fmt={(v) => pct(v, 0)} />
        <Slider label="Fraction of wealth bet f" value={f} min={0} max={0.6} step={0.005} onChange={setF} fmt={(v) => pct(v, 1)} />
        <Slider label="Number of bets" value={n} min={50} max={1000} step={50} onChange={setN} fmt={(v) => String(v)} />
        <button className="btn text-[12px]" onClick={() => setSeed(seed + 1)}>Re-run simulation</button>
      </>}
      chart={<div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-[11.5px] text-muted mb-1">Expected log growth per bet vs. fraction bet</div>
          <div style={{ height: H(compact) }}>
            <ResponsiveContainer>
              <ComposedChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="f" type="number" domain={[0, 0.6]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
                <YAxis {...AXIS} width={50} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Tooltip content={makeTooltip((l) => `Bet ${pct(Number(l), 1)}`, (v) => `${(v * 100).toFixed(3)}%`)} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <Line dataKey="er" name="Expected return per bet" stroke="var(--c2)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line dataKey="g" name="Expected log growth" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
                <ReferenceLine x={fStar} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'Kelly', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />
                <ReferenceDot x={f} y={Math.max(g, -0.06)} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted mb-1">25 simulated wealth paths at your f (log₁₀ scale)</div>
          <div style={{ height: H(compact) }}>
            <ResponsiveContainer>
              <ComposedChart data={paths} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" {...AXIS} />
                <YAxis {...AXIS} width={44} tickFormatter={(v) => (v >= 0 ? `${Math.pow(10, v) >= 100 ? Math.pow(10, v).toExponential(0) : Math.pow(10, v).toFixed(1)}×` : `${Math.pow(10, v).toFixed(2)}×`)} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                {Array.from({ length: 25 }, (_, k) => <Line key={k} dataKey={`p${k}`} stroke="var(--c1)" strokeOpacity={0.18} strokeWidth={1} dot={false} isAnimationActive={false} />)}
                <Line dataKey="medK" name="Median at Kelly" stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line dataKey="med" name="Median at your f" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: 'Median at your f', color: 'var(--c1)' }, { label: 'Median at Kelly', color: 'var(--muted)', dash: true }]} />
        </div>
      </div>}
      readout={<Readout items={[
        { label: 'Kelly f* = 2p − 1', value: pct(fStar, 1) },
        { label: 'Growth at your f', value: `${(g * 100).toFixed(3)}%/bet`, tone: g >= 0 ? 'text-pos' : 'text-neg' },
        { label: 'Growth at Kelly', value: `${(gStar * 100).toFixed(3)}%/bet` },
        { label: `Median after ${n} bets`, value: `${Math.exp(g * n).toPrecision(3)}×` },
      ]} />}
      explain={<Explain math={<>
        <p>With wealth W, betting fraction f on an even-money bet: W → W(1+f) with prob. p, W(1−f) with prob. q = 1−p. After n bets the typical wealth is W·e^(nG) where</p>
        <MathBlock>G(f) = p·ln(1+f) + q·ln(1−f){'\n'}G′(f) = p/(1+f) − q/(1−f) = 0  ⇒  f* = p − q = 2p − 1{'\n'}p = 0.55 ⇒ f* = 0.10,  G(f*) ≈ 0.00501 per bet</MathBlock>
        <p>Second-order: G(f) ≈ f·(p−q) − f²/2. The first term (edge) is linear in f, the second (variance drag) is quadratic, so growth is a downward parabola with its peak at f* and a zero at ≈ 2f*.</p>
      </>}>
        <p>The expected <strong>return</strong> per bet rises in a straight line with size — so a pure "maximise expected profit" rule says bet everything. But wealth <strong>compounds</strong>, and what compounds is the expected logarithm. That curve peaks at the Kelly fraction (10% for a 55/45 coin) and is roughly zero at twice Kelly: bet 20% and the median player goes nowhere; bet 30% and the typical path is ruined, despite a positive edge on every single bet.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 2
function FixedVsFraction({ compact }: P) {
  const [bet, setBet] = useState(15000);
  const [f, setF] = useState(0.1);
  const [p, setP] = useState(0.55);
  const [seed, setSeed] = useState(1);
  const n = 400;
  const W0 = 100000;
  const sim = useMemo(() => {
    const rng = new Rng('lab2', seed);
    const P = 600;
    const A = new Array(P).fill(W0), B = new Array(P).fill(W0);
    let ruinA = 0;
    const rows: Record<string, number>[] = [];
    const q = (xs: number[], k: number) => xs.slice().sort((a, b) => a - b)[Math.floor(k * (xs.length - 1))];
    for (let t = 0; t <= n; t++) {
      if (t > 0) for (let k = 0; k < P; k++) {
        const win = rng.next() < p;
        if (A[k] > 0) {
          const s = Math.min(bet, A[k]);
          A[k] += win ? s : -s;
          if (A[k] <= 0) { A[k] = 0; ruinA++; }
        }
        B[k] *= win ? 1 + f : 1 - f;
      }
      if (t % 10 === 0) rows.push({ t, a50: q(A, 0.5), a10: q(A, 0.1), b50: q(B, 0.5), b10: q(B, 0.1) });
    }
    return { rows, ruinA: ruinA / P, medA: q(A, 0.5), medB: q(B, 0.5), minB: Math.min(...B) };
  }, [bet, f, p, seed]);
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Fixed bet ($, starting wealth $100k)" value={bet} min={1000} max={40000} step={1000} onChange={setBet} fmt={(v) => money(v)} />
        <Slider label="Fixed fraction of current wealth" value={f} min={0.01} max={0.3} step={0.01} onChange={setF} fmt={(v) => pct(v, 0)} />
        <Slider label="Win probability" value={p} min={0.5} max={0.65} step={0.01} onChange={setP} fmt={(v) => pct(v, 0)} />
        <button className="btn text-[12px]" onClick={() => setSeed(seed + 1)}>Re-run</button>
      </>}
      chart={<>
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={sim.rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={56} tickFormatter={(v) => money(v)} scale="log" domain={[1000, 'auto']} allowDataOverflow />
              <Tooltip content={makeTooltip((l) => `After ${l} bets`, (v) => money(v))} />
              <ReferenceLine y={W0} stroke="var(--axis)" />
              <Line dataKey="a50" name="Fixed $: median" stroke="var(--c2)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              <Line dataKey="a10" name="Fixed $: 10th pct" stroke="var(--c2)" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line dataKey="b50" name="Fixed %: median" stroke="var(--c1)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
              <Line dataKey="b10" name="Fixed %: 10th pct" stroke="var(--c1)" strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Fixed dollar (median)', color: 'var(--c2)' }, { label: '10th percentile', color: 'var(--c2)', dash: true }, { label: 'Fixed fraction (median)', color: 'var(--c1)' }, { label: '10th percentile', color: 'var(--c1)', dash: true }]} />
      </>}
      readout={<Readout items={[
        { label: 'Fixed $: ruined', value: pct(sim.ruinA, 1), tone: sim.ruinA > 0.05 ? 'text-neg' : '' },
        { label: 'Fixed $: median', value: money(sim.medA) },
        { label: 'Fixed %: ruined', value: '0% (impossible)' },
        { label: 'Fixed %: median', value: money(sim.medB) },
      ]} />}
      explain={<Explain math={<>
        <p>Fixed-dollar betting is additive: W_n = W_0 + b·(wins − losses), a random walk with drift b(2p−1) per bet and an absorbing barrier at zero. The probability of ever hitting zero from W_0 is (q/p)^(W_0/b) — not negligible when b is a large share of W_0.</p>
        <p>Fixed-fraction betting is multiplicative: W_n = W_0·(1+f)^wins·(1−f)^losses &gt; 0 always. It grows geometrically at G(f) per bet.</p>
      </>}>
        <p>A fixed dollar bet ignores what you have: after a run of losses the same $ bet is a much larger share of a smaller book, which is exactly when you can least afford it — and ruin becomes possible. A fixed <strong>fraction</strong> automatically shrinks after losses and grows after gains: it can never reach zero and it compounds. Every sizing rule in the game is a fraction-of-NAV rule for this reason.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 3
function EqualPct({ compact }: P) {
  const [x, setX] = useState(0.2);
  const [pairs, setPairs] = useState(10);
  const data = useMemo(() => {
    const rows = [];
    let w = 1;
    for (let t = 0; t <= 2 * pairs; t++) {
      if (t > 0) w *= t % 2 === 1 ? 1 + x : 1 - x;
      rows.push({ t, w });
    }
    return rows;
  }, [x, pairs]);
  const rec = Array.from({ length: 19 }, (_, i) => {
    const L = (i + 1) * 0.05;
    return { L, g: L / (1 - L) };
  });
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Gain then equal % loss, x" value={x} min={0.01} max={0.6} step={0.01} onChange={setX} fmt={(v) => pct(v, 0)} />
        <Slider label="Number of +x/−x pairs" value={pairs} min={1} max={25} step={1} onChange={setPairs} fmt={(v) => String(v)} />
      </>}
      chart={<div className="grid md:grid-cols-2 gap-3">
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" {...AXIS} />
              <YAxis {...AXIS} width={44} tickFormatter={(v) => `${v.toFixed(2)}×`} domain={[0, 'auto']} />
              <Tooltip content={makeTooltip((l) => `Step ${l}`, (v) => `${v.toFixed(3)}×`)} />
              <ReferenceLine y={1} stroke="var(--axis)" />
              <Line dataKey="w" name="Wealth" stroke="var(--c1)" strokeWidth={2.2} dot={{ r: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={rec} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="L" {...AXIS} tickFormatter={(v) => pct(v, 0)} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => pct(v, 0)} domain={[0, 4]} allowDataOverflow />
              <Tooltip content={makeTooltip((l) => `Loss ${pct(Number(l), 0)}`, (v) => `needs +${pct(v, 0)}`)} />
              <Bar dataKey="g" name="Gain needed to recover" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {rec.map((r, i) => <Cell key={i} fill={r.L >= 0.5 ? 'var(--neg-fill)' : 'var(--c1)'} />)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>}
      readout={<Readout items={[
        { label: 'After one pair', value: `${((1 + x) * (1 - x)).toFixed(4)}× = 1 − x²` },
        { label: `After ${pairs} pairs`, value: `${Math.pow(1 - x * x, pairs).toFixed(3)}×`, tone: 'text-neg' },
        { label: 'Arithmetic avg return', value: '0.0%' },
        { label: 'Geometric avg / step', value: signedPct(Math.sqrt(1 - x * x) - 1, 2) },
      ]} />}
      explain={<Explain math={<MathBlock>(1 + x)(1 − x) = 1 − x²   {'\n'}after n pairs: (1 − x²)ⁿ  →  ln W ≈ −n·x²{'\n'}recovering from a loss L requires a gain of L / (1 − L)</MathBlock>}>
        <p>A +20% gain followed by a −20% loss leaves you at 0.96, not 1.00. The average return was zero, but wealth fell by x². That loss comes purely from <strong>variability</strong>: the same arithmetic average with bigger swings compounds to less. It is the simplest form of volatility drag — and it is why a 50% drawdown needs a 100% gain to recover (right chart).</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 4
function ArithGeo({ compact }: P) {
  const [mu, setMu] = useState(0.08);
  const [sig, setSig] = useState(0.25);
  const [seed, setSeed] = useState(1);
  const years = 30;
  const sim = useMemo(() => {
    const rng = new Rng('lab4', seed);
    const P = 800;
    const cagr: number[] = [];
    let arith = 0;
    for (let k = 0; k < P; k++) {
      let lw = 0;
      for (let t = 0; t < years; t++) {
        const r = Math.max(-0.99, mu + sig * rng.normal());
        arith += r;
        lw += Math.log(1 + r);
      }
      cagr.push(Math.exp(lw / years) - 1);
    }
    cagr.sort((a, b) => a - b);
    return { arith: arith / (P * years), med: cagr[Math.floor(P / 2)], p10: cagr[Math.floor(P * 0.1)], p90: cagr[Math.floor(P * 0.9)] };
  }, [mu, sig, seed]);
  const curve = Array.from({ length: 41 }, (_, i) => {
    const s = (i / 40) * 0.8;
    return { s, geo: mu - (s * s) / 2, arith: mu };
  });
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Arithmetic mean return μ (per year)" value={mu} min={0} max={0.25} step={0.005} onChange={setMu} fmt={(v) => pct(v, 1)} />
        <Slider label="Volatility σ (per year)" value={sig} min={0} max={0.8} step={0.01} onChange={setSig} fmt={(v) => pct(v, 0)} />
        <button className="btn text-[12px]" onClick={() => setSeed(seed + 1)}>Re-run 800 × 30-year paths</button>
      </>}
      chart={<><div style={{ height: H(compact) }}>
        <ResponsiveContainer>
          <ComposedChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="s" type="number" domain={[0, 0.8]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
            <YAxis {...AXIS} width={48} tickFormatter={(v) => pct(v, 0)} domain={[-0.25, 'auto']} allowDataOverflow />
            <Tooltip content={makeTooltip((l) => `σ = ${pct(Number(l), 0)}`, (v) => pct(v, 2))} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Line dataKey="arith" name="Arithmetic mean μ" stroke="var(--c2)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            <Line dataKey="geo" name="Geometric ≈ μ − σ²/2" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
            <ReferenceDot x={sig} y={sim.med} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'Arithmetic mean', color: 'var(--c2)' }, { label: 'Geometric (compound) ≈ μ − σ²/2', color: 'var(--c1)' }, { label: 'Simulated median CAGR', color: 'var(--accent)' }]} /></>}
      readout={<Readout items={[
        { label: 'Average yearly return', value: pct(sim.arith, 2) },
        { label: 'μ − σ²/2', value: pct(mu - sig * sig / 2, 2) },
        { label: 'Median simulated CAGR', value: pct(sim.med, 2) },
        { label: '10th–90th pct CAGR', value: `${pct(sim.p10, 1)} … ${pct(sim.p90, 1)}` },
      ]} />}
      explain={<Explain math={<MathBlock>E[ln(1+R)] ≈ E[R] − ½·Var(R)   (Taylor expansion of ln around 1){'\n'}geometric mean ≈ μ − σ²/2</MathBlock>}>
        <p>The return you <em>average</em> is not the return you <em>earn</em>. Compound growth is approximately the arithmetic mean minus half the variance. A strategy with an 8% average return and 40% volatility compounds at roughly 0% — the drag eats the entire edge. Reducing volatility (diversifying, sizing down) is not merely about comfort; it directly raises long-run wealth.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 5
function LogVsMean({ compact }: P) {
  const [up, setUp] = useState(0.5);
  const [dn, setDn] = useState(0.4);
  const [f, setF] = useState(1);
  const [n, setN] = useState(30);
  const p = 0.5;
  const gu = 1 + f * up, gd = 1 - f * dn;
  const meanGrowth = p * gu + (1 - p) * gd;
  const g = p * Math.log(gu) + (1 - p) * Math.log(Math.max(gd, 1e-9));
  const dist = useMemo(() => Array.from({ length: n + 1 }, (_, k) => {
    const w = Math.pow(gu, k) * Math.pow(Math.max(gd, 0), n - k);
    return { k, w, prob: binomPmf(k, n, p) };
  }), [n, gu, gd]);
  const below = dist.filter((d) => d.w < 1).reduce((a, d) => a + d.prob, 0);
  const curve = Array.from({ length: n + 1 }, (_, t) => ({ t, mean: Math.pow(meanGrowth, t), median: Math.exp(g * t) }));
  const kelly = Math.max(0, kellyDiscrete([{ r: up, p }, { r: -dn, p: 1 - p }], 5));
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Up move" value={up} min={0.05} max={1} step={0.05} onChange={setUp} fmt={(v) => '+' + pct(v, 0)} />
        <Slider label="Down move" value={dn} min={0.05} max={0.9} step={0.05} onChange={setDn} fmt={(v) => '−' + pct(v, 0)} />
        <Slider label="Fraction of wealth exposed" value={f} min={0} max={1} step={0.01} onChange={setF} fmt={(v) => pct(v, 0)} />
        <Slider label="Rounds" value={n} min={5} max={100} step={1} onChange={setN} fmt={(v) => String(v)} />
        <div className="text-[11.5px] text-muted">50/50 coin. Kelly exposure for these payoffs: <b className="num">{pct(kelly, 0)}</b></div>
      </>}
      chart={<><div style={{ height: H(compact) }}>
        <ResponsiveContainer>
          <ComposedChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="t" {...AXIS} />
            <YAxis {...AXIS} width={52} scale="log" domain={['auto', 'auto']} tickFormatter={(v) => `${Number(v).toPrecision(2)}×`} />
            <Tooltip content={makeTooltip((l) => `Round ${l}`, (v) => `${v.toPrecision(3)}×`)} />
            <ReferenceLine y={1} stroke="var(--axis)" />
            <Line dataKey="mean" name="Expected (mean) wealth" stroke="var(--c2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="median" name="Median wealth = e^(nG)" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'Expected (mean) wealth', color: 'var(--c2)' }, { label: 'Median (typical) wealth', color: 'var(--c1)' }]} /></>}
      readout={<Readout items={[
        { label: 'Expected return / round', value: signedPct(meanGrowth - 1, 1), tone: meanGrowth >= 1 ? 'text-pos' : 'text-neg' },
        { label: 'Expected log growth', value: signedPct(Math.exp(g) - 1, 2), tone: g >= 0 ? 'text-pos' : 'text-neg' },
        { label: `Mean wealth after ${n}`, value: `${Math.pow(meanGrowth, n).toPrecision(3)}×` },
        { label: `P(below start after ${n})`, value: pct(below, 0) },
      ]} />}
      explain={<Explain math={<MathBlock>E[W_n] = (p·u + q·d)ⁿ  — grows if the arithmetic mean {'>'} 1{'\n'}median W_n = e^(n·G),  G = p·ln u + q·ln d — shrinks if G {'<'} 0{'\n'}+50% / −40%:  E = 1.05 per round, but G = ½ln1.5 + ½ln0.6 = −0.0527</MathBlock>}>
        <p>With +50%/−40% on a fair coin, expected wealth grows 5% a round — yet almost every individual player loses everything. The mean is held up by a vanishingly small number of astronomically lucky paths. A fund manager lives one path, so the relevant quantity is the expected <strong>log</strong>, which here is negative. Reduce the exposure fraction toward Kelly and the median line turns upward: the same bet, sized correctly, becomes a winner.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 6
function MarginalDrag({ compact }: P) {
  const [mu, setMu] = useState(0.002);
  const [sig, setSig] = useState(0.02);
  const [L, setL] = useState(3);
  const nav = 1_000_000;
  const fStar = mu / (sig * sig);
  const Lmax = Math.max(2.5 * fStar, L * 1.3, 1);
  const data = Array.from({ length: 61 }, (_, i) => {
    const x = (i / 60) * Lmax;
    return { x, benefit: mu * x * nav, drag: 0.5 * sig * sig * x * x * nav, growth: (mu * x - 0.5 * sig * sig * x * x) * nav, mb: mu * nav / 100, mc: sig * sig * x * nav / 100 };
  });
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Edge per period μ (per $ exposed)" value={mu} min={0.0002} max={0.006} step={0.0001} onChange={setMu} fmt={(v) => `${(v * 1e4).toFixed(0)}bp`} />
        <Slider label="Volatility per period σ" value={sig} min={0.005} max={0.06} step={0.001} onChange={setSig} fmt={(v) => pct(v, 1)} />
        <Slider label="Exposure (× NAV)" value={L} min={0} max={Lmax} step={0.05} onChange={setL} fmt={(v) => `${v.toFixed(2)}×`} />
      </>}
      chart={<div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-[11.5px] text-muted mb-1">$ per period on a $1M book</div>
          <div style={{ height: H(compact) }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="x" type="number" domain={[0, Lmax]} tickFormatter={(v) => `${v.toFixed(1)}×`} {...AXIS} />
                <YAxis {...AXIS} width={52} tickFormatter={(v) => money(v)} />
                <Tooltip content={makeTooltip((l) => `${Number(l).toFixed(2)}× NAV`, (v) => money(v))} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <Line dataKey="benefit" name="Edge (linear)" stroke="var(--c3)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="drag" name="Drag (quadratic)" stroke="var(--c8)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="growth" name="Compound growth" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
                <ReferenceLine x={L} stroke="var(--accent)" />
                <ReferenceLine x={fStar} stroke="var(--muted)" strokeDasharray="3 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted mb-1">Marginal $ per extra 1% of NAV exposure</div>
          <div style={{ height: H(compact) }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="x" type="number" domain={[0, Lmax]} tickFormatter={(v) => `${v.toFixed(1)}×`} {...AXIS} />
                <YAxis {...AXIS} width={52} tickFormatter={(v) => money(v)} />
                <Tooltip content={makeTooltip((l) => `${Number(l).toFixed(2)}× NAV`, (v) => money(v))} />
                <Line dataKey="mb" name="Marginal benefit μ" stroke="var(--c3)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="mc" name="Marginal drag σ²·x" stroke="var(--c8)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceLine x={L} stroke="var(--accent)" />
                <ReferenceLine x={fStar} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'equal', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>}
      readout={<Readout items={[
        { label: 'Edge at your size', value: money(mu * L * nav) },
        { label: 'Drag at your size', value: money(0.5 * sig * sig * L * L * nav), tone: 'text-neg' },
        { label: 'Net compound growth', value: money((mu * L - 0.5 * sig * sig * L * L) * nav) },
        { label: 'Optimum μ/σ²', value: `${fStar.toFixed(2)}× NAV` },
      ]} />}
      explain={<Explain math={<MathBlock>g(x) ≈ μx − ½σ²x²{'\n'}g′(x) = μ − σ²x   (marginal benefit − marginal drag){'\n'}g′(x*) = 0 ⇒ x* = μ/σ²,   g(x*) = μ²/(2σ²) = ½·Sharpe²</MathBlock>}>
        <p>In dollars: at {L.toFixed(1)}× NAV the edge earns {money(mu * L * nav)} a period and the drag costs {money(0.5 * sig * sig * L * L * nav)}. Double the exposure and the edge doubles to {money(2 * mu * L * nav)}, but the drag <strong>quadruples</strong> to {money(2 * sig * sig * L * L * nav)}. A small advantage grows linearly with size while its cost grows with the square — so there is always a point where the next dollar of exposure costs more than it earns. That point is μ/σ², the Kelly leverage.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 7
function UnequalPayoffs({ compact }: P) {
  const [p, setP] = useState(0.4);
  const [b, setB] = useState(2);
  const [a, setA] = useState(1);
  const fStar = Math.max(0, kellyBinary(p, b, a));
  const o = [{ r: b, p }, { r: -a, p: 1 - p }];
  const fMax = Math.min(1 / a, Math.max(0.05, fStar * 2.5)) * 0.999;
  const curve = Array.from({ length: 61 }, (_, i) => {
    const f = (i / 60) * fMax;
    const g = expectedLogGrowth(f, o);
    return { f, g: isFinite(g) ? Math.max(g, -0.1) : -0.1 };
  });
  const lines = [0.5, 1, 2, 4, 8].map((bb) => ({ bb }));
  const grid = Array.from({ length: 41 }, (_, i) => {
    const pp = 0.05 + (i / 40) * 0.9;
    const row: Record<string, number> = { p: pp };
    lines.forEach(({ bb }) => (row[`b${bb}`] = Math.max(0, Math.min(1, kellyBinary(pp, bb, 1)))));
    return row;
  });
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Win probability p" value={p} min={0.02} max={0.95} step={0.01} onChange={setP} fmt={(v) => pct(v, 0)} />
        <Slider label="Win payoff b (per $ staked)" value={b} min={0.1} max={10} step={0.1} onChange={setB} fmt={(v) => `+${v.toFixed(1)}`} />
        <Slider label="Loss a (per $ staked)" value={a} min={0.1} max={1} step={0.05} onChange={setA} fmt={(v) => `−${v.toFixed(2)}`} />
      </>}
      chart={<div className="grid md:grid-cols-2 gap-3">
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="f" type="number" domain={[0, fMax]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
              <YAxis {...AXIS} width={50} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <Tooltip content={makeTooltip((l) => `Stake ${pct(Number(l), 1)}`, (v) => `${(v * 100).toFixed(3)}%`)} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Line dataKey="g" name="Expected log growth" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
              <ReferenceLine x={fStar} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'Kelly', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div style={{ height: H(compact) }}>
            <ResponsiveContainer>
              <ComposedChart data={grid} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="p" type="number" domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} {...AXIS} />
                <YAxis {...AXIS} width={44} tickFormatter={(v) => pct(v, 0)} domain={[0, 1]} />
                <Tooltip content={makeTooltip((l) => `p = ${pct(Number(l), 0)}`, (v) => pct(v, 1))} />
                {lines.map(({ bb }, i) => <Line key={bb} dataKey={`b${bb}`} name={`b = ${bb}`} stroke={SERIES[i]} strokeWidth={1.8} dot={false} isAnimationActive={false} />)}
                <ReferenceDot x={p} y={Math.min(1, fStar)} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={lines.map(({ bb }, i) => ({ label: `win ${bb}:1`, color: SERIES[i] }))} />
        </div>
      </div>}
      readout={<Readout items={[
        { label: 'Expected value per $', value: signedPct(p * b - (1 - p) * a, 1) },
        { label: 'Kelly f* = p/a − q/b', value: pct(fStar, 1) },
        { label: 'Growth at Kelly', value: `${(expectedLogGrowth(fStar, o) * 100).toFixed(3)}%` },
        { label: 'P(lose the bet)', value: pct(1 - p, 0) },
      ]} />}
      explain={<Explain math={<MathBlock>G(f) = p·ln(1 + b·f) + q·ln(1 − a·f){'\n'}G′(f) = p·b/(1+bf) − q·a/(1−af) = 0  ⇒  f* = p/a − q/b{'\n'}lottery (p = 0.12, b = 8, a = 1): EV = +8% per $ staked, yet f* = 0.12 − 0.88/8 = 1% of wealth</MathBlock>}>
        <p>Kelly is not "edge divided by odds" in your head — it depends on the whole shape. A long-shot with a large payoff can have a big expected value and still deserve only a sliver of capital (or none), because most of the time the stake is lost. Conversely a high-probability bet with a tiny gain and a big loss (carry, short vol) can have a small optimal size despite winning 90% of the time. The right chart shows how the optimal stake changes with p for different payoff ratios.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 8
function EstimationUncertainty({ compact }: P) {
  const [pTrue, setPTrue] = useState(0.55);
  const [n, setN] = useState(100);
  const [K, setK] = useState(1);
  const [c, setC] = useState(1);
  // distribution of the estimate p̂ (of the selected best-of-K strategy)
  const res = useMemo(() => {
    const pmf = Array.from({ length: n + 1 }, (_, k) => binomPmf(k, n, pTrue));
    const cdf: number[] = [];
    pmf.reduce((a, x, i) => (cdf[i] = a + x), 0);
    // max of K iid: P(max ≤ k) = F(k)^K
    const pmfMax = pmf.map((_, k) => Math.pow(cdf[k], K) - (k > 0 ? Math.pow(cdf[k - 1], K) : 0));
    const o = (pp: number) => [{ r: 1, p: pp }, { r: -1, p: 1 - pp }];
    const gAt = (cc: number) => {
      let g = 0;
      for (let k = 0; k <= n; k++) {
        if (pmfMax[k] < 1e-12) continue;
        const ph = k / n;
        const f = Math.min(0.99, Math.max(0, cc * (2 * ph - 1)));
        g += pmfMax[k] * expectedLogGrowth(f, o(pTrue));
      }
      return g;
    };
    const curve = Array.from({ length: 41 }, (_, i) => ({ c: (i / 40) * 2, g: Math.max(gAt((i / 40) * 2), -0.02) }));
    const best = curve.reduce((a, x) => (x.g > a.g ? x : a), curve[0]);
    const meanPhat = pmfMax.reduce((a, x, k) => a + x * (k / n), 0);
    const fTrue = Math.max(0, 2 * pTrue - 1);
    const varF = 4 * pTrue * (1 - pTrue) / n;
    return { curve, best, meanPhat, gTrue: expectedLogGrowth(fTrue, o(pTrue)), gHere: gAt(c), shrink: fTrue > 0 ? fTrue * fTrue / (fTrue * fTrue + varF) : 0 };
  }, [pTrue, n, K, c]);
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="True win probability" value={pTrue} min={0.5} max={0.65} step={0.005} onChange={setPTrue} fmt={(v) => pct(v, 1)} />
        <Slider label="Track record used to estimate it (bets)" value={n} min={10} max={2000} step={10} onChange={setN} fmt={(v) => String(v)} />
        <Slider label="Pick the best of K backtested strategies" value={K} min={1} max={20} step={1} onChange={setK} fmt={(v) => String(v)} />
        <Slider label="Bet c × estimated Kelly" value={c} min={0} max={2} step={0.05} onChange={setC} fmt={(v) => `${v.toFixed(2)}×`} />
      </>}
      chart={<><div style={{ height: H(compact) }}>
        <ResponsiveContainer>
          <ComposedChart data={res.curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="c" type="number" domain={[0, 2]} tickFormatter={(v) => `${v}×`} {...AXIS} />
            <YAxis {...AXIS} width={56} tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} />
            <Tooltip content={makeTooltip((l) => `${Number(l).toFixed(2)}× estimated Kelly`, (v) => `${(v * 100).toFixed(3)}%`)} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <ReferenceLine y={res.gTrue} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'if p were known', fill: 'var(--muted)', fontSize: 10, position: 'insideTopRight' }} />
            <Line dataKey="g" name="Expected true growth" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
            <ReferenceLine x={res.best.c} stroke="var(--c3)" strokeDasharray="3 3" label={{ value: 'best c', fill: 'var(--c3)', fontSize: 10, position: 'top' }} />
            <ReferenceDot x={c} y={Math.max(res.gHere, -0.02)} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div></>}
      readout={<Readout items={[
        { label: 'Avg estimated p̂', value: pct(res.meanPhat, 1), tone: res.meanPhat > pTrue + 0.005 ? 'text-warn' : '' },
        { label: 'Best multiplier c*', value: `${res.best.c.toFixed(2)}×` },
        { label: 'Shrinkage formula (K=1)', value: `${res.shrink.toFixed(2)}×` },
        { label: 'Growth at your c', value: `${(res.gHere * 100).toFixed(3)}%`, tone: res.gHere >= 0 ? 'text-pos' : 'text-neg' },
      ]} />}
      explain={<Explain math={<>
        <MathBlock>p̂ ~ Binomial(n, p)/n,   f̂ = 2p̂ − 1,   bet c·f̂{'\n'}near the optimum G(f) ≈ G* − ½σ²(f − f*)²{'\n'}E[G] = G* − ½σ²[(c−1)²f*² + c²·Var(f̂)]  ⇒  c* = f*² / (f*² + Var f̂){'\n'}Var f̂ = 4p(1−p)/n</MathBlock>
        <p>Selecting the best of K strategies adds a second effect: the winner's estimate is biased upward (winner's curse), so the optimal multiplier falls further. The curve above is computed exactly over the full distribution of p̂ (and of the maximum of K estimates).</p>
      </>}>
        <p>You never know p; you estimate it from a finite record. Sizing to the estimated Kelly overbets whenever the estimate is too high, and overbetting costs more than underbetting saves. With 100 bets of history the best multiplier is well below 1 — fractional Kelly is not timidity, it is the optimal response to estimation error. Increase K (choose the best-looking of many backtests) and watch the estimated edge inflate while the true optimum shrinks. This is why the game's quoted probabilities come with bands, and why some of its best-looking trades are traps.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 9
function CorrelatedBets({ compact }: P) {
  const [N, setN] = useState(10);
  const [rho, setRho] = useState(0.3);
  const [sr, setSr] = useState(0.1);
  const [beta, setBeta] = useState(0.7);
  const [stress, setStress] = useState(false);
  const sigma = 0.02;
  const mu = sr * sigma;
  const nEff = (k: number, r: number) => k / (1 + (k - 1) * r);
  const curve = Array.from({ length: 30 }, (_, i) => {
    const k = i + 1;
    return { k, g: (0.5 * sr * sr * nEff(k, rho)) * 52, g0: 0.5 * sr * sr * k * 52 };
  });
  const totalExp = (N * mu) / (sigma * sigma * (1 + (N - 1) * rho));
  // ten strategies, one hidden factor
  const fv = stress ? 3 : 1;
  const c = (beta * beta * fv * fv) / (beta * beta * fv * fv + (1 - beta * beta));
  const names = ['Stat arb', 'Value L/S', 'Momentum', 'ST reversal', 'Merger arb', 'Basis RV', 'FX carry', 'Short vol', 'HY credit', 'Quality'];
  const sim = useMemo(() => {
    const rng = new Rng('lab9', beta, stress ? 1 : 0);
    let w = 1, peak = 1, mdd = 0;
    const path: { t: number; w: number }[] = [{ t: 0, w: 1 }];
    for (let t = 1; t <= 52; t++) {
      const F = rng.normal() * fv;
      let r = 0;
      for (let i = 0; i < 10; i++) r += 0.1 * 0.03 * (0.15 + beta * F + Math.sqrt(1 - beta * beta) * rng.normal());
      w *= 1 + r * 3;
      peak = Math.max(peak, w);
      mdd = Math.max(mdd, 1 - w / peak);
      path.push({ t, w });
    }
    return { path, mdd };
  }, [beta, stress, fv]);
  return (
    <div className="space-y-6">
      <Layout compact={compact}
        controls={<>
          <Slider label="Number of bets N" value={N} min={1} max={30} step={1} onChange={setN} fmt={(v) => String(v)} />
          <Slider label="Pairwise correlation ρ" value={rho} min={0} max={0.95} step={0.01} onChange={setRho} fmt={(v) => v.toFixed(2)} />
          <Slider label="Per-bet Sharpe (per period)" value={sr} min={0.02} max={0.3} step={0.01} onChange={setSr} fmt={(v) => v.toFixed(2)} />
        </>}
        chart={<><div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={curve} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="k" {...AXIS} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => pct(v, 0)} />
              <Tooltip content={makeTooltip((l) => `${l} bets`, (v) => pct(v, 1))} />
              <Line dataKey="g0" name="Max growth if independent" stroke="var(--c3)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line dataKey="g" name={`Max growth at ρ = ${rho.toFixed(2)}`} stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
              <ReferenceLine x={N} stroke="var(--accent)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Independent bets', color: 'var(--c3)' }, { label: 'Correlated bets', color: 'var(--c1)' }]} /></>}
        readout={<Readout items={[
          { label: 'Effective # of bets', value: nEff(N, rho).toFixed(2) },
          { label: 'Ceiling as N → ∞', value: rho > 0 ? (1 / rho).toFixed(1) : '∞' },
          { label: 'Kelly total exposure', value: `${totalExp.toFixed(1)}× NAV` },
          { label: 'Naive Σ standalone Kelly', value: `${(N * mu / (sigma * sigma)).toFixed(1)}× NAV`, tone: 'text-warn' },
        ]} />}
        explain={<Explain math={<MathBlock>N equal bets, pairwise ρ:  Var(portfolio) ∝ N·σ²·(1 + (N−1)ρ){'\n'}N_eff = N / (1 + (N−1)ρ)  →  1/ρ as N → ∞{'\n'}max growth = ½·SR²·N_eff,   Kelly total exposure = N·μ / (σ²(1 + (N−1)ρ))</MathBlock>}>
          <p>Diversification lets you carry more total exposure because independent risks partly cancel. But with correlation ρ you can never have more than 1/ρ effective bets: at ρ = 0.3, a hundred strategies are worth barely three. Summing standalone Kelly sizes treats correlated bets as independent and can overbet several-fold.</p>
        </Explain>}
      />
      <div className="border-t border-line pt-5">
        <div className="font-semibold text-[14px] mb-1">Ten strategies, one factor</div>
        <Layout compact={compact}
          controls={<>
            <Slider label="Hidden loading on the crowding factor β" value={beta} min={0} max={0.95} step={0.05} onChange={setBeta} fmt={(v) => v.toFixed(2)} />
            <label className="flex items-center gap-2 text-[12.5px] text-ink2"><input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} /> Crowded unwind (factor vol × 3)</label>
            <div className="text-[11.5px] text-muted">Each strategy: return = small edge + β·F + idiosyncratic noise, at 3× gross.</div>
          </>}
          chart={<div className="grid md:grid-cols-2 gap-3">
            <div className="overflow-x-auto">
              <table className="text-[9.5px] num border-separate" style={{ borderSpacing: 2 }}>
                <tbody>
                  {names.map((nm, i) => (
                    <tr key={nm}>
                      <td className="pr-1 text-right text-ink2 font-sans whitespace-nowrap">{nm}</td>
                      {names.map((_, j) => <td key={j} className="w-6 h-5 rounded-sm text-center" style={{ background: i === j ? 'var(--panel-2)' : divergingColor(c), color: c > 0.55 && i !== j ? '#fff' : 'var(--text-2)' }}>{i === j ? '' : c.toFixed(1).replace('0.', '.')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ height: H(compact) }}>
              <ResponsiveContainer>
                <ComposedChart data={sim.path} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="t" {...AXIS} />
                  <YAxis {...AXIS} width={44} tickFormatter={(v) => `${v.toFixed(2)}×`} domain={['auto', 'auto']} />
                  <Tooltip content={makeTooltip((l) => `Week ${l}`, (v) => `${v.toFixed(3)}×`)} />
                  <ReferenceLine y={1} stroke="var(--axis)" />
                  <Line dataKey="w" name="Equal-weight portfolio" stroke="var(--c1)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>}
          readout={<Readout items={[
            { label: 'Pairwise correlation', value: c.toFixed(2) },
            { label: 'Effective # strategies', value: nEff(10, c).toFixed(1) },
            { label: '1-year max drawdown', value: pct(sim.mdd, 1), tone: sim.mdd > 0.2 ? 'text-neg' : '' },
            { label: 'Calm → stressed ρ', value: `${(beta * beta).toFixed(2)} → ${((9 * beta * beta) / (9 * beta * beta + 1 - beta * beta)).toFixed(2)}` },
          ]} />}
          explain={<Explain>
            <p>Ten strategies with ten different stories — but each earns part of its return by providing liquidity to the same crowded trade. In calm markets the shared factor barely moves, so measured correlations look low and the desk reports ten diversifiers. When the crowd unwinds, the factor's volatility triples and correlations converge toward one: you were running one bet, ten times. Level 2 presents exactly this set at turn 9.</p>
          </Explain>}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 10
function LeverageRuin({ compact }: P) {
  const [mu, setMu] = useState(0.04);
  const [sig, setSig] = useState(0.05);
  const [spread, setSpread] = useState(0.01);
  const [L, setL] = useState(6);
  const [mcThr, setMcThr] = useState(0.25);
  const rf = 0.03;
  const Lmax = 25;
  const g = (l: number) => rf + l * (mu - spread * (l > 1 ? (l - 1) / l : 0)) - 0.5 * l * l * sig * sig;
  const Lstar = (mu - spread) / (sig * sig);
  const ruin = useMemo(() => {
    const rng = new Rng('lab10');
    const P = 300, T = 52;
    const shocks: number[] = [];
    for (let i = 0; i < P * T; i++) {
      // fat tails: normal mixture (5% of weeks at 3× vol)
      const s = rng.next() < 0.05 ? 3 : 1;
      shocks.push(rng.normal() * s / Math.sqrt(0.95 + 0.05 * 9));
    }
    return Array.from({ length: 26 }, (_, i) => {
      const l = i;
      let hit = 0;
      for (let p = 0; p < P; p++) {
        let w = 1, pk = 1;
        for (let t = 0; t < T; t++) {
          const r = (rf + l * (mu - spread)) / 52 + l * (sig / Math.sqrt(52)) * shocks[p * T + t];
          w *= 1 + Math.max(-1, r);
          pk = Math.max(pk, w);
          if (1 - w / pk >= mcThr) { hit++; break; }
        }
      }
      return { l, p: hit / P, g: g(l) };
    });
  }, [mu, sig, spread, mcThr]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Unlevered excess return μ (annual)" value={mu} min={0.005} max={0.1} step={0.005} onChange={setMu} fmt={(v) => pct(v, 1)} />
        <Slider label="Unlevered volatility σ (annual)" value={sig} min={0.01} max={0.2} step={0.005} onChange={setSig} fmt={(v) => pct(v, 1)} />
        <Slider label="Financing spread on borrowed $" value={spread} min={0} max={0.04} step={0.0025} onChange={setSpread} fmt={(v) => pct(v, 2)} />
        <Slider label="Leverage L" value={L} min={0} max={Lmax} step={0.5} onChange={setL} fmt={(v) => `${v.toFixed(1)}×`} />
        <Slider label="Forced-deleveraging drawdown" value={mcThr} min={0.05} max={0.5} step={0.05} onChange={setMcThr} fmt={(v) => pct(v, 0)} />
      </>}
      chart={<div className="grid md:grid-cols-2 gap-3">
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={ruin} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="l" {...AXIS} tickFormatter={(v) => `${v}×`} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => pct(v, 0)} domain={[-0.2, 'auto']} allowDataOverflow />
              <Tooltip content={makeTooltip((l) => `${l}× leverage`, (v) => pct(v, 2))} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Line dataKey="g" name="Compound growth (annual)" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
              <ReferenceLine x={L} stroke="var(--accent)" />
              <ReferenceLine x={Lstar} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'L*', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ height: H(compact) }}>
          <ResponsiveContainer>
            <ComposedChart data={ruin} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="l" {...AXIS} tickFormatter={(v) => `${v}×`} />
              <YAxis {...AXIS} width={44} domain={[0, 1]} tickFormatter={(v) => pct(v, 0)} />
              <Tooltip content={makeTooltip((l) => `${l}× leverage`, (v) => pct(v, 1))} />
              <Area dataKey="p" name={`P(drawdown ≥ ${pct(mcThr, 0)} within a year)`} stroke="var(--neg-fill)" fill="var(--neg-fill)" fillOpacity={0.2} isAnimationActive={false} />
              <ReferenceLine x={L} stroke="var(--accent)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>}
      readout={<Readout items={[
        { label: 'Growth at your L', value: signedPct(g(L), 1), tone: g(L) >= rf ? 'text-pos' : 'text-neg' },
        { label: 'Growth-optimal L*', value: `${Lstar.toFixed(1)}×` },
        { label: 'Growth at L*', value: signedPct(g(Lstar), 1) },
        { label: 'P(forced deleverage)', value: pct(ruin[Math.min(25, Math.round(L))].p, 0), tone: 'text-neg' },
      ]} />}
      explain={<Explain math={<MathBlock>g(L) ≈ r + L·(μ − s) − ½·L²σ²   (s = funding spread){'\n'}L* = (μ − s) / σ²{'\n'}beyond 2L* growth falls below the cash rate</MathBlock>}>
        <p>A low-volatility, positive-edge strategy (relative value, basis trades) looks like it deserves enormous leverage — the growth-optimal level is (μ − s)/σ². But the formula assumes Gaussian returns and no forced selling. With fat tails and a margin call triggered by a drawdown, the probability of being forced out climbs steeply long before L*. Net market exposure of zero does not make a 20× book safe: the spread itself moves, and in a liquidity crisis funding costs and haircuts rise exactly when the spread widens.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 11
function RepeatedBets({ compact }: P) {
  const [p, setP] = useState(0.55);
  const [n, setN] = useState(100);
  const dist = useMemo(() => Array.from({ length: n + 1 }, (_, k) => ({ k, prob: binomPmf(k, n, p) })), [n, p]);
  const lo = dist.reduce((a, d) => a + (d.k * 2 < n ? d.prob : 0), 0);
  const tie = n % 2 === 0 ? binomPmf(n / 2, n, p) : 0;
  const mean = n * p;
  const sd = Math.sqrt(n * p * (1 - p));
  const needed = (() => {
    for (let m = 1; m <= 5000; m += m < 100 ? 1 : 10) {
      let s = 0;
      for (let k = Math.floor(m / 2) + 1; k <= m; k++) s += binomPmf(k, m, p);
      if (s >= 0.95) return m;
    }
    return NaN;
  })();
  const exact = binomPmf(Math.round(mean), n, p);
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Win probability" value={p} min={0.5} max={0.7} step={0.01} onChange={setP} fmt={(v) => pct(v, 0)} />
        <Slider label="Number of even-money bets" value={n} min={10} max={1000} step={10} onChange={setN} fmt={(v) => String(v)} />
      </>}
      chart={<div style={{ height: H(compact) }}>
        <ResponsiveContainer>
          <ComposedChart data={dist} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="k" {...AXIS} type="number" domain={[Math.max(0, Math.floor(mean - 4.5 * sd)), Math.min(n, Math.ceil(mean + 4.5 * sd))]} allowDataOverflow />
            <YAxis {...AXIS} width={44} tickFormatter={(v) => pct(v, 1)} />
            <Tooltip content={makeTooltip((l) => `${l} wins of ${n}`, (v) => pct(v, 2))} />
            <Bar dataKey="prob" name="Probability" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {dist.map((d) => <Cell key={d.k} fill={d.k * 2 < n ? 'var(--neg-fill)' : d.k * 2 === n ? 'var(--muted)' : 'var(--c1)'} />)}
            </Bar>
            <ReferenceLine x={mean} stroke="var(--text-2)" strokeDasharray="3 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>}
      readout={<Readout items={[
        { label: `P(exactly ${Math.round(mean)} wins)`, value: pct(exact, 1) },
        { label: '95% range of wins', value: `${Math.max(0, Math.round(mean - 1.96 * sd))}–${Math.min(n, Math.round(mean + 1.96 * sd))}` },
        { label: 'P(behind after n)', value: pct(lo, 1), tone: 'text-neg', hint: `Plus ${pct(tie, 1)} chance of finishing exactly even` },
        { label: 'Bets for 95% to be ahead', value: isFinite(needed) ? String(needed) : '>5000' },
      ]} />}
      explain={<Explain math={<MathBlock>wins ~ Binomial(n, p):  mean np,  sd √(np(1−p)){'\n'}edge per bet = 2p − 1;  noise per bet = 1{'\n'}t-stat of the edge after n bets ≈ (2p−1)·√n / (2√(p(1−p))) — grows only with √n</MathBlock>}>
        <p>"55% to win" does not mean 55 wins out of 100. The chance of exactly 55 is under 8%, a 95% range spans roughly 45 to 65, and there is about a 13% chance of being behind after 100 bets with a genuine edge. Skill reveals itself only with the square root of the number of bets — which is why a manager with a handful of trades (or a pod with a short track record) tells you very little, and why the game grades decisions rather than outcomes.</p>
      </Explain>}
    />
  );
}

// ---------------------------------------------------------------- 12
function SharpeAllocation({ compact }: P) {
  const [srA, setSrA] = useState(1.3);
  const [srB, setSrB] = useState(1.2);
  const [srD, setSrD] = useState(1.2);
  const [srC, setSrC] = useState(0.8);
  const [rho, setRho] = useState(0.6);
  const [rhoC, setRhoC] = useState(0);
  const names = ['A · Equity stat arb', 'B · Quant factors', 'D · Credit RV', 'C · Trend (CTA)'];
  const srs = [srA, srB, srD, srC];
  const res = useMemo(() => {
    const vol = 0.1;
    const S = [
      [1, rho, rho, rhoC],
      [rho, 1, rho, rhoC],
      [rho, rho, 1, rhoC],
      [rhoC, rhoC, rhoC, 1],
    ].map((row) => row.map((c) => c * vol * vol));
    const mu = srs.map((s) => s * vol);
    try {
      const w = kellyMeanVariance(mu, S);
      let v = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) v += w[i] * S[i][j] * w[j];
      const scale = 0.1 / Math.sqrt(v);
      const ws = w.map((x) => x * scale);
      const portSr = mu.reduce((a, m, i) => a + m * ws[i], 0) / 0.1;
      return { ws, portSr, ok: true };
    } catch {
      return { ws: [0, 0, 0, 0], portSr: 0, ok: false };
    }
  }, [srA, srB, srD, srC, rho, rhoC]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = names.map((nm, i) => ({ nm, w: res.ws[i], sr: srs[i] }));
  const top = data.reduce((a, d) => (d.w > a.w ? d : a), data[0]);
  return (
    <Layout compact={compact}
      controls={<>
        <Slider label="Sharpe A" value={srA} min={0} max={2.5} step={0.05} onChange={setSrA} fmt={(v) => v.toFixed(2)} />
        <Slider label="Sharpe B" value={srB} min={0} max={2.5} step={0.05} onChange={setSrB} fmt={(v) => v.toFixed(2)} />
        <Slider label="Sharpe D" value={srD} min={0} max={2.5} step={0.05} onChange={setSrD} fmt={(v) => v.toFixed(2)} />
        <Slider label="Sharpe C" value={srC} min={0} max={2.5} step={0.05} onChange={setSrC} fmt={(v) => v.toFixed(2)} />
        <Slider label="Correlation among A, B, D" value={rho} min={0} max={0.9} step={0.05} onChange={setRho} fmt={(v) => v.toFixed(2)} />
        <Slider label="Correlation of C with the others" value={rhoC} min={-0.3} max={0.3} step={0.05} onChange={setRhoC} fmt={(v) => v.toFixed(2)} />
      </>}
      chart={<div style={{ height: H(compact) }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="nm" {...AXIS} interval={0} tick={{ ...AXIS.tick, fontSize: 9.5 }} />
            <YAxis {...AXIS} width={44} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip content={makeTooltip((l) => String(l), (v, k) => (k === 'w' ? `${(v * 100).toFixed(0)}% capital (10% vol book)` : v.toFixed(2)))} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Bar dataKey="w" name="Optimal allocation" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={SERIES[i]} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>}
      readout={<Readout items={[
        { label: 'Highest Sharpe', value: data.reduce((a, d) => (d.sr > a.sr ? d : a), data[0]).nm.split(' · ')[0] },
        { label: 'Largest allocation', value: top.nm.split(' · ')[0], tone: 'text-accent' },
        { label: 'Portfolio Sharpe', value: num(res.portSr, 2) },
        { label: 'Best single strategy', value: num(Math.max(...srs), 2) },
      ]} />}
      explain={<Explain math={<MathBlock>log-optimal (Gaussian) weights:  w ∝ Σ⁻¹μ{'\n'}portfolio Sharpe² = μᵀΣ⁻¹μ{'\n'}with three strategies sharing correlation ρ, each one's marginal value falls with ρ; an uncorrelated strategy keeps all of its Sharpe</MathBlock>}>
        <p>Strategies A, B and D share a common driver; C is unrelated. Because A's returns are largely available through B and D, its <em>marginal</em> contribution is much smaller than its standalone Sharpe suggests — while C brings something nobody else in the book has. At the default settings the lowest-Sharpe strategy gets the largest allocation. Allocate to what a strategy adds to the portfolio, not to its standalone statistics.</p>
      </Explain>}
    />
  );
}

export interface Experiment {
  id: number;
  title: string;
  blurb: string;
  Component: ComponentType<P>;
}

export const EXPERIMENTS: Experiment[] = [
  { id: 1, title: 'Kelly with a 55/45 coin', blurb: 'Why there is an optimal bet size, and why 2× Kelly gives zero growth.', Component: KellyCoin },
  { id: 2, title: 'Fixed dollars vs fixed fraction', blurb: 'Additive vs multiplicative betting, and the possibility of ruin.', Component: FixedVsFraction },
  { id: 3, title: 'Equal % gains and losses', blurb: '+20% then −20% is not break-even.', Component: EqualPct },
  { id: 4, title: 'Arithmetic vs geometric returns', blurb: 'Compound growth ≈ μ − σ²/2.', Component: ArithGeo },
  { id: 5, title: 'Log growth vs expected wealth', blurb: 'Mean wealth grows while almost everyone goes broke.', Component: LogVsMean },
  { id: 6, title: 'Marginal edge vs marginal drag', blurb: 'Linear benefit, quadratic cost — in dollars.', Component: MarginalDrag },
  { id: 7, title: 'Kelly with unequal payoffs', blurb: 'Long shots, carry trades and the shape of the payoff.', Component: UnequalPayoffs },
  { id: 8, title: 'Estimation uncertainty & sizing', blurb: 'Why fractional Kelly is optimal when the edge is estimated.', Component: EstimationUncertainty },
  { id: 9, title: 'Correlated bets & hidden factors', blurb: 'Effective number of bets; ten strategies, one factor.', Component: CorrelatedBets },
  { id: 10, title: 'Leverage, growth & ruin', blurb: 'Optimal leverage, financing and forced deleveraging.', Component: LeverageRuin },
  { id: 11, title: 'Repeated independent bets', blurb: 'What "55% to win" really means.', Component: RepeatedBets },
  { id: 12, title: 'Sharpe ≠ allocation', blurb: 'Allocate to marginal contribution, not standalone Sharpe.', Component: SharpeAllocation },
];
