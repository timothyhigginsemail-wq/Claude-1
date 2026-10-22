import { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, bookSandbox, familiesOf, pitchNote, view } from '../engine/game';
import { AssetId, DAY, EQUITIES, SPECS, MarketView, atmImplied, impliedVol } from '../engine/market';
import { AutocallInst, AutocallResult, Instrument, unitPV } from '../engine/pricing';
import { Risk, bumpSpot, bumpTime, bumpVol } from '../engine/risk';
import { hash32 } from '../engine/math';
import { store } from './store';
import { LearnLink, Seg, Sheet, Tabs, kfmt, sgnUsd, usd } from './common';
import { COLORS, Histogram, LineChart } from './charts';
import type { LabRequest } from '../workers/lab.worker';

export function LabSheet({ g, preset }: { g: GameState; preset?: string }) {
  const [tab, setTab] = useState<'struct' | 'options'>(preset?.startsWith('opt') ? 'options' : 'struct');
  return (
    <Sheet title="Pricing Lab" sub="Build, price and stress products. The clock is paused while you're here." right={<LearnLink topic={tab === 'struct' ? 'autocall' : 'barrier'} label="Learn" />}>
      <Tabs value={tab} onChange={setTab} options={[['struct', 'Structurer'], ['options', 'Option lab']]} />
      {tab === 'struct' ? <Structurer g={g} preset={preset} /> : <OptionLab g={g} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- worker plumbing

interface LabResult {
  id: number;
  coupon: number;
  A: number;
  B: number;
  res: AutocallResult;
  hist: { bins: number[]; lo: number; hi: number };
  risk: Risk | null;
  stress: { id: string; label: string; pv: number }[] | null;
}

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('../workers/lab.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

function useLab(req: Omit<LabRequest, 'id'> | null, key: string) {
  const [out, setOut] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!req) return;
    const id = ++seq.current;
    setBusy(true);
    const w = getWorker();
    const t = setTimeout(() => w.postMessage({ ...req, id }), 180);
    const on = (e: MessageEvent<LabResult>) => {
      if (e.data.id !== seq.current) return;
      setOut(e.data);
      setBusy(false);
    };
    w.addEventListener('message', on);
    return () => {
      clearTimeout(t);
      w.removeEventListener('message', on);
    };
  }, [key]);
  return { out, busy };
}

// ---------------------------------------------------------------- structurer

interface Terms {
  assets: AssetId[];
  years: number;
  autocall: number;
  callFrom: number;
  couponBarrier: number;
  ki: number;
  memory: boolean;
  notional: number;
  margin: number;
}

function termsFromPreset(g: GameState, preset?: string): Terms {
  if (preset?.startsWith('rfq:')) {
    const r = g.rfqs.find((x) => x.id === preset.slice(4));
    if (r && r.inst.type === 'autocall') {
      const i = r.inst;
      return { assets: i.assets, years: Math.round((i.obs[i.obs.length - 1] - view(g).t)), autocall: i.autocall, callFrom: i.callFrom, couponBarrier: i.couponBarrier, ki: i.ki, memory: i.memory, notional: r.notional / 1e6, margin: r.streetMargin };
    }
  }
  return { assets: ['ORX', 'NKT'], years: 3, autocall: 1, callFrom: 1, couponBarrier: 0.7, ki: 0.6, memory: true, notional: 40, margin: 0.02 };
}

function buildNote(t: Terms, v: MarketView, day: number, seed: number): AutocallInst {
  const obs: number[] = [];
  for (let k = 1; k <= t.years * 4; k++) obs.push((day + 63 * k + 1) * DAY);
  return { type: 'autocall', assets: t.assets, initial: t.assets.map((a) => v.spot[a]), obs, callFrom: t.callFrom, autocall: t.autocall, couponBarrier: t.couponBarrier, coupon: 0, memory: t.memory, ki: t.ki, next: 0, missed: 0, seed };
}

function Structurer({ g, preset }: { g: GameState; preset?: string }) {
  const v = view(g);
  const [t, setT] = useState<Terms>(() => termsFromPreset(g, preset));
  const set = <K extends keyof Terms>(k: K, x: Terms[K]) => setT((o) => ({ ...o, [k]: x }));
  const seed = hash32(g.seed, 'lab', g.market.day);
  const inst = useMemo(() => buildNote(t, v, g.market.day, seed), [JSON.stringify(t), g.market.t]);
  const key = JSON.stringify(t) + g.market.t;
  const { out, busy } = useLab({ inst, view: v, paths: 16384, withRisk: true, margin: t.margin }, key);
  const fam = familiesOf(g);
  const canPitch = fam.has('autocall') && g.mode !== 'sandbox' && g.phase === 'trading';
  const couponPa = out ? out.coupon * 4 * 100 : null;
  const N = t.notional * 1e6;
  return (
    <>
      <div className="card">
        <div className="micro" style={{ marginBottom: 8 }}>Underlyings (worst-of)</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {EQUITIES.map((a) => {
            const on = t.assets.includes(a);
            return (
              <button key={a} className={`pill ${on ? 'acc' : ''}`} onClick={() => set('assets', on ? (t.assets.length > 1 ? t.assets.filter((x) => x !== a) : t.assets) : [...t.assets, a])}>
                {SPECS[a].name} · v{(atmImplied(v, a, 1) * 100).toFixed(0)}
              </button>
            );
          })}
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <Slider label={`Tenor ${t.years}Y`} min={1} max={5} step={1} value={t.years} onChange={(x) => set('years', x)} />
          <Slider label={`Notional $${t.notional}m`} min={5} max={150} step={5} value={t.notional} onChange={(x) => set('notional', x)} />
          <Slider label={`Autocall ${(t.autocall * 100).toFixed(0)}%`} min={0.8} max={1.1} step={0.05} value={t.autocall} onChange={(x) => set('autocall', x)} />
          <Slider label={`Non-call ${t.callFrom * 3}M`} min={0} max={4} step={1} value={t.callFrom} onChange={(x) => set('callFrom', x)} />
          <Slider label={`Coupon barrier ${(t.couponBarrier * 100).toFixed(0)}%`} min={0.5} max={1} step={0.05} value={t.couponBarrier} onChange={(x) => set('couponBarrier', x)} />
          <Slider label={`Knock-in ${(t.ki * 100).toFixed(0)}%`} min={0.4} max={0.8} step={0.05} value={t.ki} onChange={(x) => set('ki', x)} />
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <Seg value={t.memory ? 1 : 0} onChange={(x) => set('memory', x === 1)} options={[[1, 'Memory'], [0, 'No memory']]} />
          <Slider label={`Desk margin ${(t.margin * 100).toFixed(2)}%`} min={0} max={0.05} step={0.0025} value={t.margin} onChange={(x) => set('margin', x)} />
        </div>
      </div>

      <div className="card" style={{ borderColor: 'rgba(215,247,91,.35)', opacity: busy ? 0.75 : 1, transition: 'opacity .2s' }}>
        <div className="between">
          <span className="micro">Coupon at par for {(t.margin * 100).toFixed(2)}% margin</span>
          <span className="micro">{busy ? 'pricing 16k paths…' : out ? `±${(out.res.stdErr * 200).toFixed(2)}% MC 2σ` : ''}</span>
        </div>
        <div className="hero-num acc" style={{ margin: '6px 0 2px' }}>{couponPa !== null ? `${couponPa.toFixed(2)}%` : '—'}<span className="muted" style={{ fontSize: 16 }}> p.a.</span></div>
        <div className="dim" style={{ fontSize: 13 }}>Desk earns {usd(N * t.margin)} at inception on {usd(N)}. The investor buys at 100%, and the note is worth {(100 - t.margin * 100).toFixed(2)}% on our model.</div>
        {out && (
          <div className="grid3" style={{ marginTop: 10 }}>
            <div className="stat"><div className="micro">P(knock-in)</div><div className="v">{(out.res.kiProb * 100).toFixed(1)}%</div></div>
            <div className="stat"><div className="micro">Exp. life</div><div className="v">{out.res.expLife.toFixed(2)}y</div></div>
            <div className="stat"><div className="micro">P(call 1st)</div><div className="v">{((out.res.callProb[t.callFrom] ?? 0) * 100).toFixed(0)}%</div></div>
          </div>
        )}
      </div>

      {out && <NoteCharts out={out} inst={{ ...inst, coupon: out.coupon }} />}
      {out && out.risk && <NoteRisk out={out} N={N} assets={t.assets} />}

      <div className="row" style={{ gap: 8 }}>
        {g.mode === 'sandbox' && (
          <button className="btn primary grow" disabled={!out || g.phase !== 'trading'} onClick={() => { if (!out) return; store.act((g) => bookSandbox(g, { ...inst, coupon: out.coupon, seed: hash32(seed, g.book.nextId) }, -N, true)); store.toast('Note issued into the sandbox book (at mid)'); store.open('book'); }}>
            Issue into book
          </button>
        )}
        {canPitch && (
          <button className="btn primary grow" disabled={!out} onClick={() => { if (!out) return; store.act((g) => pitchNote(g, { ...inst, coupon: out.coupon }, N, out.coupon * 400)); store.open(null); store.toast('Pitched to Aurelia — waiting for their answer'); }}>
            Pitch to Aurelia at {couponPa?.toFixed(2)}%
          </button>
        )}
        {!canPitch && g.mode !== 'sandbox' && <div className="muted" style={{ fontSize: 12 }}>Issuing structured notes unlocks at Senior Trader. Until then, explore.</div>}
      </div>
    </>
  );
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (x: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function NoteCharts({ out, inst }: { out: LabResult; inst: AutocallInst }) {
  const paths = out.res.paths ?? [];
  const n = inst.obs.length;
  // worst-of path per simulation, coloured by fate
  const series = paths.slice(0, 40).map((p) => {
    const worst = p[0].map((_, k) => Math.min(...p.map((asset) => asset[k])));
    let fate: 'call' | 'ki' | 'mat' = 'mat';
    let len = worst.length;
    for (let k = 0; k < worst.length; k++) {
      if (k >= inst.callFrom && k < n - 1 && worst[k] >= inst.autocall) {
        fate = 'call';
        len = k + 1;
        break;
      }
    }
    if (fate !== 'call' && worst[worst.length - 1] < inst.ki) fate = 'ki';
    const data: [number, number][] = [[0, 100], ...worst.slice(0, len).map((w, k) => [(k + 1) * 3, w * 100] as [number, number])];
    return { data, color: fate === 'call' ? COLORS.up : fate === 'ki' ? COLORS.down : COLORS.ink2, width: 1, opacity: 0.55 };
  });
  const cashflows = useMemo(() => exampleFlows(paths, inst), [out.id]);
  return (
    <>
      <div className="card">
        <div className="card-title"><span className="micro">Simulated worst-of paths</span><span className="legend"><span><i style={{ background: COLORS.up }} />autocalled</span><span><i style={{ background: COLORS.ink2 }} />to maturity</span><span><i style={{ background: COLORS.down }} />knocked in</span></span></div>
        <LineChart height={190} series={series} xFmt={(x) => `${x.toFixed(0)}M`} yFmt={(y) => `${y.toFixed(0)}`} hlines={[{ y: inst.autocall * 100, label: 'call', color: COLORS.up }, { y: inst.couponBarrier * 100, label: 'coupon', color: COLORS.warn }, { y: inst.ki * 100, label: 'KI', color: COLORS.down }]} />
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 4 }}>Distribution of the investor's discounted payoff (% of notional)</div>
        <Histogram bins={out.hist.bins} lo={out.hist.lo * 100} hi={out.hist.hi * 100} fmt={(x) => `${x.toFixed(0)}%`} marks={[{ x: out.res.pv * 100, label: `fair ${(out.res.pv * 100).toFixed(1)}%`, color: COLORS.acc }]} colorFn={(x) => (x < 100 ? COLORS.down : COLORS.up)} />
        <div className="muted" style={{ fontSize: 11.5 }}>Most paths pay coupons and redeem early. The long left tail is the investor's knock-in loss, and it's what pays for the coupon.</div>
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 6 }}>Example scenarios (cash flows to the investor)</div>
        {cashflows.map((c) => (
          <div key={c.title} style={{ marginBottom: 8 }}>
            <div className="between" style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{c.title}</span><span className="mono">{c.total.toFixed(1)}%</span></div>
            <div className="muted" style={{ fontSize: 12 }}>{c.flows}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 6 }}>Autocall probability by quarter</div>
        <div className="row" style={{ alignItems: 'flex-end', height: 64, gap: 3 }}>
          {out.res.callProb.map((p, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.max(2, p * 250)}%`, maxHeight: '100%', background: i < inst.callFrom ? COLORS.ink4 : COLORS.acc, opacity: 0.8, borderRadius: 3 }} title={`${(p * 100).toFixed(1)}%`} />
          ))}
        </div>
        <div className="between muted" style={{ fontSize: 10.5 }}><span>3M</span><span>{n * 3}M</span></div>
      </div>
    </>
  );
}

function exampleFlows(paths: number[][][], inst: AutocallInst) {
  const out: { title: string; flows: string; total: number }[] = [];
  const want = new Set<string>();
  for (const p of paths) {
    const worst = p[0].map((_, k) => Math.min(...p.map((a) => a[k])));
    let missed = 0;
    const flows: string[] = [];
    let total = 0;
    let fate = 'Runs to maturity';
    for (let k = 0; k < worst.length; k++) {
      const last = k === worst.length - 1;
      const mult = 1 + (inst.memory ? missed : 0);
      if (!last && k >= inst.callFrom && worst[k] >= inst.autocall) {
        const c = inst.coupon * mult * 100;
        flows.push(`Q${k + 1}: called, 100% + ${c.toFixed(2)}%`);
        total += 100 + c;
        fate = k <= inst.callFrom + 1 ? 'Early autocall' : 'Late autocall';
        break;
      }
      if (worst[k] >= inst.couponBarrier) {
        const c = inst.coupon * mult * 100;
        flows.push(`Q${k + 1}: ${c.toFixed(2)}%`);
        total += c;
        missed = 0;
      } else {
        flows.push(`Q${k + 1}: —`);
        missed++;
      }
      if (last) {
        const principal = worst[k] >= inst.ki ? 100 : worst[k] * 100;
        if (worst[k] < inst.ki) fate = 'Knock-in loss';
        flows.push(`maturity ${principal.toFixed(1)}%`);
        total += principal;
      }
    }
    if (!want.has(fate)) {
      want.add(fate);
      out.push({ title: fate, flows: flows.join(' · '), total });
    }
    if (want.size >= 4) break;
  }
  return out;
}

function NoteRisk({ out, N, assets }: { out: LabResult; N: number; assets: AssetId[] }) {
  const r = out.risk!;
  const q = -N; // desk is short the note
  return (
    <div className="card">
      <div className="card-title"><span className="micro">Desk risk if issued (short {usd(N)} of note)</span><LearnLink topic="correlation" label="Correlation" /></div>
      <table className="t">
        <thead><tr><th></th><th>Δ /1%</th><th>Γ /1%</th><th>vega/pt</th></tr></thead>
        <tbody>
          {assets.map((a) => (<tr key={a}><td>{SPECS[a].name}</td><td>{kfmt(r.delta[a] * q)}</td><td>{kfmt(r.gamma[a] * q)}</td><td>{kfmt(r.vega[a] * q)}</td></tr>))}
          {assets.includes('AUR') && <tr><td>EURUSD (quanto)</td><td>{kfmt(r.delta.EURUSD * q)}</td><td>—</td><td>{kfmt(r.vega.EURUSD * q)}</td></tr>}
        </tbody>
      </table>
      <div className="kv" style={{ marginTop: 8 }}>
        <span>Correlation / pt</span><span>{kfmt(r.corr01 * q)}</span>
        <span>Theta / day</span><span>{kfmt(r.theta * q)}</span>
        <span>DV01</span><span>{kfmt(r.dv01 * q)}</span>
      </div>
      {out.stress && (
        <>
          <div className="micro" style={{ margin: '10px 0 4px' }}>Stress (desk P&L, before hedges)</div>
          <div className="col" style={{ gap: 4 }}>
            {out.stress.map((s) => {
              const pnl = (s.pv - out.res.pv) * q;
              return (
                <div key={s.id} className="between" style={{ fontSize: 12.5 }}><span className="muted">{s.label}</span><span className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>{sgnUsd(pnl)}</span></div>
              );
            })}
          </div>
        </>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        Hedge delta with futures and shares, and vega with longer-dated OTM puts near the KI. Correlation: nothing listed hedges it. Recycle it through opposite client flow, or charge for it in the margin.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- option lab

function OptionLab({ g }: { g: GameState }) {
  const v = view(g);
  const [type, setType] = useState<'vanilla' | 'digital' | 'barrier'>('barrier');
  const [asset, setAsset] = useState<AssetId>('ORX');
  const [cp, setCp] = useState<'C' | 'P'>('P');
  const [k, setK] = useState(1);
  const [h, setH] = useState(0.85);
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [days, setDays] = useState(63);
  const S = v.spot[asset];
  const dir: 'down' | 'up' = h < 1 ? 'down' : 'up';
  const inst: Instrument = type === 'vanilla' ? { type, asset, cp, strike: S * k, expiry: v.t + days * DAY } : type === 'digital' ? { type, asset, cp, strike: S * k, expiry: v.t + days * DAY } : { type, asset, cp, strike: S * k, barrier: S * h, dir, kind, expiry: v.t + days * DAY };
  const curves = useMemo(() => {
    const times = [0, Math.floor(days / 2), days - 1];
    const res = times.map((d) => {
      const vt = bumpTime(v, d);
      const val: [number, number][] = [];
      const del: [number, number][] = [];
      const gam: [number, number][] = [];
      const veg: [number, number][] = [];
      for (let i = -25; i <= 25; i++) {
        const m = i / 100;
        const vv = bumpSpot(vt, asset, m);
        const p0 = unitPV(inst, vv);
        const pu = unitPV(inst, bumpSpot(vv, asset, 0.005));
        const pd = unitPV(inst, bumpSpot(vv, asset, -0.005));
        val.push([m * 100, (p0 / S) * 100]);
        del.push([m * 100, ((pu - pd) / (0.01 * S * (1 + m))) * 1]);
        gam.push([m * 100, ((pu - 2 * p0 + pd) / (0.005 * 0.005)) * 1e-4 / S * 100]);
        veg.push([m * 100, ((unitPV(inst, bumpVol(vv, asset, 1)) - p0) / S) * 100]);
      }
      return { d, val, del, gam, veg };
    });
    return res;
  }, [type, asset, cp, k, h, kind, days, g.market.t]);
  const price = unitPV(inst, v);
  // compare to the same product priced with a flat ATM vol (no smile)
  const flat = useMemo(() => {
    const vv = { ...v, smile: { ...v.smile, [asset]: { ...v.smile[asset], skew: 0, curv: 0 } } };
    return unitPV(inst, vv);
  }, [type, asset, cp, k, h, kind, days, g.market.t]);
  const cols = [COLORS.acc, COLORS.violet, COLORS.ink3];
  const lbl = (d: number) => (d === 0 ? 'today' : `in ${d}d`);
  const sv = impliedVol(v, asset, S * k, days * DAY);
  return (
    <>
      <Seg value={type} onChange={setType} options={[['vanilla', 'Vanilla'], ['digital', 'Digital'], ['barrier', 'Barrier']]} />
      <div className="grid2">
        <Seg value={asset} onChange={setAsset} options={EQUITIES.map((a) => [a, SPECS[a].name] as [AssetId, string])} />
        <Seg value={cp} onChange={setCp} options={[['P', 'Put'], ['C', 'Call']]} />
      </div>
      <div className="grid2">
        <Slider label={`Strike ${(k * 100).toFixed(0)}%`} min={0.7} max={1.3} step={0.01} value={k} onChange={setK} />
        <Slider label={`Expiry ${days}d`} min={5} max={252} step={1} value={days} onChange={setDays} />
        {type === 'barrier' && <Slider label={`Barrier ${(h * 100).toFixed(0)}% (${dir})`} min={0.6} max={1.4} step={0.01} value={h} onChange={(x) => setH(Math.abs(x - 1) < 0.01 ? 0.99 : x)} />}
        {type === 'barrier' && <Seg value={kind} onChange={setKind} options={[['in', 'Knock-in'], ['out', 'Knock-out']]} />}
      </div>
      <div className="grid3">
        <div className="stat"><div className="micro">Price</div><div className="v">{((price / S) * 100).toFixed(3)}%</div><div className="s">of spot</div></div>
        <div className="stat"><div className="micro">Flat-vol price</div><div className="v">{((flat / S) * 100).toFixed(3)}%</div><div className="s">smile removed</div></div>
        <div className="stat"><div className="micro">Strike vol</div><div className="v">{(sv * 100).toFixed(2)}</div><div className="s">ATM {(atmImplied(v, asset, days * DAY) * 100).toFixed(2)}</div></div>
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 4 }}>Value (% of spot) vs spot move, through time</div>
        <LineChart height={160} series={curves.map((c, i) => ({ data: c.val, color: cols[i], label: lbl(c.d) }))} xFmt={(x) => `${x.toFixed(0)}%`} yFmt={(y) => y.toFixed(1)} legend vlines={type === 'barrier' ? [{ x: (h - 1) * 100, label: 'H', color: COLORS.warn }] : [{ x: (k - 1) * 100, label: 'K' }]} />
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 4 }}>Delta (per unit) · watch it near the barrier or strike</div>
        <LineChart height={130} zeroLine series={curves.map((c, i) => ({ data: c.del, color: cols[i], label: lbl(c.d) }))} xFmt={(x) => `${x.toFixed(0)}%`} yFmt={(y) => y.toFixed(2)} />
      </div>
      <div className="grid2">
        <div className="card">
          <div className="micro" style={{ marginBottom: 4 }}>Gamma</div>
          <LineChart height={110} zeroLine series={curves.map((c, i) => ({ data: c.gam, color: cols[i] }))} xFmt={(x) => `${x.toFixed(0)}`} yFmt={(y) => y.toFixed(1)} />
        </div>
        <div className="card">
          <div className="micro" style={{ marginBottom: 4 }}>Vega (% per pt)</div>
          <LineChart height={110} zeroLine series={curves.map((c, i) => ({ data: c.veg, color: cols[i] }))} xFmt={(x) => `${x.toFixed(0)}`} yFmt={(y) => y.toFixed(2)} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {type === 'barrier' ? 'Reiner–Rubinstein, continuous monitoring, flat vol at the strike. A knock-out\'s gamma and vega flip sign near the barrier. A knock-in behaves like a vanilla once it is close.' : type === 'digital' ? 'The digital includes the smile slope (−vega·dσ/dK). Near expiry, delta at the strike blows up. Most desks book these as call spreads.' : 'Black–Scholes on the smile. Gamma peaks at the strike and sharpens as expiry approaches.'}
      </div>
    </>
  );
}
