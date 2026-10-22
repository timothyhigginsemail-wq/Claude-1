import { Fragment, useMemo, useState } from 'react';
import { GameState, absNow, fmtQuote, liquidity, passRfq, quoteRfq, view, limitsOf } from '../engine/game';
import { Rfq, bookedInstrument, clientById, edgeAtQuote, hitProbability, notionalPerUnit, quoteForEdge } from '../engine/clients';
import { ASSETS, AssetId, EQUITIES, SPECS, atmImplied, impliedVol } from '../engine/market';
import { AutocallInst, autocallMC, describeInstrument, unitPV, periodsPerYear, fmtStrike } from '../engine/pricing';
import { Risk, addRisk, computeVaR, instrumentRisk, scaleRisk, zeroRisk, bumpSpot } from '../engine/risk';
import { tenorLabel } from '../engine/book';
import { store } from './store';
import { Avatar, LearnLink, Meter, Sheet, kfmt, pnlCls, sgnUsd, usd } from './common';
import { COLORS, LineChart } from './charts';

const TOPIC: Record<string, string> = { vanilla: 'vanilla', barrier: 'barrier', digital: 'digital', autocall: 'autocall', swap: 'swap', forward: 'fxfwd', spot: 'delta' };

export function RfqSheet({ g, id }: { g: GameState; id: string }) {
  const r = g.rfqs.find((x) => x.id === id);
  if (!r) return <Sheet title="RFQ">Not found.</Sheet>;
  return <Ticket g={g} r={r} key={r.id} />;
}

function Ticket({ g, r }: { g: GameState; r: Rfq }) {
  const v = view(g);
  const c = clientById(r.client);
  const rel = g.rel[r.client];
  const liq = liquidity(g);
  const live = r.status === 'open';
  const tKey = g.market.t;
  const npu = notionalPerUnit(r.inst, v);
  const mid = useMemo(() => quoteForEdge(r, 0, v), [tKey, r.id]);
  const [edge, setEdge] = useState(() => (r.quoteEdge !== undefined ? r.quoteEdge : r.streetMargin));
  const q = useMemo(() => quoteForEdge(r, edge, v), [edge, tKey, r.id]);
  const edgeUsd = edge * r.notional;
  const hit = hitProbability(r, edge, rel, liq);
  const step = r.streetMargin / 4;

  // trade risk at the fair level (risk barely depends on the quote)
  const tradeRisk = useMemo(() => {
    const { inst } = bookedInstrument(r, mid);
    return scaleRisk(instrumentRisk(inst, v), r.deskQty);
  }, [tKey, r.id]);
  const after = useMemo(() => {
    const a = zeroRisk();
    addRisk(a, g.book.risk, 1);
    addRisk(a, tradeRisk, 1);
    return a;
  }, [tradeRisk, g.book.risk]);
  const varAfter = useMemo(() => computeVaR(after, v, 7, 1000).var99, [after]);
  const L = limitsOf(g);
  const und: AssetId[] = r.inst.type === 'autocall' ? r.inst.assets : r.inst.type === 'swap' ? [] : [r.inst.asset];
  const metricLabel = { premium: r.inst.type === 'digital' ? 'Premium, % of payout' : 'Premium, % of notional', rate: 'Fixed rate', fwd: 'Forward rate', coupon: 'Coupon p.a. at par' }[r.kind];
  const better = r.kind === 'coupon' ? 'lower coupon = more edge' : r.deskQty < 0 && r.kind === 'premium' ? 'higher = more edge' : r.kind === 'premium' ? 'lower = more edge' : r.kind === 'rate' ? (r.deskQty < 0 ? 'lower rate = more edge' : 'higher rate = more edge') : r.deskQty > 0 ? 'lower = more edge' : 'higher = more edge';
  const volEquiv = r.inst.type === 'vanilla' && r.kind === 'premium' ? volAt(r, q, v) : null;
  const left = Math.max(0, r.expires - absNow(g)) * 5;

  return (
    <Sheet
      title={<span className="row"><Avatar id={r.client} size={28} />{c.name}</span>}
      sub={`${r.clientSide.toUpperCase()} · ${usd(r.notional)} · ${live ? `${left} min left (clock paused)` : r.status}`}
      foot={
        live ? (
          <>
            <button className="btn ghost" onClick={() => { store.act((g) => passRfq(g, r.id)); store.open(null); }}>Pass</button>
            <button className="btn primary grow" onClick={() => { store.act((g) => quoteRfq(g, r.id, q)); store.open(null); }}>
              Quote {fmtQuote(r, q)}
            </button>
          </>
        ) : (
          <button className="btn grow" onClick={() => store.open(null)}>Close</button>
        )
      }
    >
      <div className="card">
        <div className="between" style={{ marginBottom: 6 }}>
          <span className="micro">The ask</span>
          <LearnLink topic={TOPIC[r.inst.type] ?? 'vanilla'} label="How it works" />
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 4 }}>{describeInstrument(r.inst, (t) => tenorLabel(t - v.t))}</div>
        <div className="dim" style={{ fontSize: 13.5 }}>{r.note}</div>
        <Terms r={r} g={g} />
      </div>

      <div className="card">
        <div className="between">
          <span className="micro">Client</span>
          <span className="micro">{c.type}</span>
        </div>
        <div className="dim" style={{ fontSize: 13, margin: '6px 0 10px' }}>{c.blurb}</div>
        <div className="grid2">
          <div>
            <div className="between" style={{ fontSize: 12 }}><span className="muted">Relationship</span><span className="mono">{rel.toFixed(0)}</span></div>
            <Meter value={rel / 100} warnAt={2} />
          </div>
          <div>
            <div className="between" style={{ fontSize: 12 }}><span className="muted">Sophistication</span><span className="mono">{(c.sophistication * 100).toFixed(0)}</span></div>
            <Meter value={c.sophistication} warnAt={2} />
          </div>
        </div>
        {c.informed > 0.3 && <div className="warn" style={{ fontSize: 12.5, marginTop: 8 }}>⚠ Known to trade on information. <LearnLink topic="informed" label="Adverse selection" /></div>}
      </div>

      <div className="card" style={{ borderColor: 'rgba(215,247,91,.35)' }}>
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="micro">{metricLabel}</span>
          <span className="micro">{better}</span>
        </div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <div className="stat"><div className="micro">Model mid</div><div className="v">{fmtQuote(r, mid)}</div><div className="s">fair value, our model</div></div>
          <div className="stat"><div className="micro">Street margin</div><div className="v">{usd(r.streetMargin * r.notional)}</div><div className="s">{(r.streetMargin * 1e4).toFixed(1)}bp of notional, typical</div></div>
        </div>
        {live ? (
          <>
            <div className="stepper">
              <button onClick={() => setEdge((e) => e - step)}>−</button>
              <div className="val">{fmtQuote(r, q)}</div>
              <button onClick={() => setEdge((e) => e + step)}>+</button>
            </div>
            <input type="range" min={-r.streetMargin} max={r.streetMargin * 3} step={r.streetMargin / 40} value={edge} onChange={(e) => setEdge(Number(e.target.value))} />
          </>
        ) : (
          <div className="kv">
            <span>Your quote</span><span>{r.quote !== undefined ? fmtQuote(r, r.quote) : '—'}</span>
            <span>Outcome</span><span>{r.outcome ?? r.status}</span>
            {r.coverQuote !== undefined && (r.status === 'lost' || r.status === 'won') && (<><span>Best competitor</span><span>{fmtQuote(r, r.coverQuote)}</span></>)}
          </div>
        )}
        {live && (
          <div className="grid3" style={{ marginTop: 6 }}>
            <div className="stat"><div className="micro">Your edge</div><div className={`v ${pnlCls(edgeUsd)}`}>{sgnUsd(edgeUsd)}</div><div className="s">{(edge * 1e4).toFixed(1)}bp</div></div>
            <div className="stat"><div className="micro">Sales read</div><div className="v">{(hit * 100).toFixed(0)}%</div><div className="s">chance to win</div></div>
            <div className="stat"><div className="micro">{volEquiv !== null ? 'Implied vol' : 'vs margin'}</div><div className="v">{volEquiv !== null ? (volEquiv * 100).toFixed(2) : `${(edge / r.streetMargin).toFixed(1)}×`}</div><div className="s">{volEquiv !== null ? `mid ${(volAt(r, mid, v)! * 100).toFixed(2)}` : 'of street'}</div></div>
          </div>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Priya's estimate comes from how other dealers usually price this, not from their actual quotes. A good relationship buys you some benefit of the doubt.
        </div>
      </div>

      <div className="card">
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="micro">What it does to your book</span>
          <LearnLink topic="gamma" label="Greeks" />
        </div>
        <RiskDelta r={r} tradeRisk={tradeRisk} before={g.book.risk} after={after} und={und} />
        <div className="col" style={{ marginTop: 10, gap: 6 }}>
          <LimitAfter label="VaR 99%" before={g.varRes.var99} after={varAfter} limit={L.var99} />
          <LimitAfter label="Σ|vega|" before={ASSETS.reduce((s, a) => s + Math.abs(g.book.risk.vega[a]), 0)} after={ASSETS.reduce((s, a) => s + Math.abs(after.vega[a]), 0)} limit={L.vega} />
          {und.map((a) => (
            <LimitAfter key={a} label={`Δ ${SPECS[a].name}`} before={Math.abs(g.book.risk.delta[a])} after={Math.abs(after.delta[a])} limit={L.delta} />
          ))}
        </div>
        <TraderRead r={r} tradeRisk={tradeRisk} g={g} und={und} />
      </div>

      {r.inst.type === 'autocall' ? <NoteAnalytics r={r} g={g} coupon={q} /> : r.inst.type !== 'swap' && r.inst.type !== 'forward' ? <PayoffCard r={r} g={g} /> : null}
    </Sheet>
  );
}

function volAt(r: Rfq, q: number, v: ReturnType<typeof view>): number | null {
  if (r.inst.type !== 'vanilla') return null;
  const inst = r.inst;
  const npu = notionalPerUnit(inst, v);
  const target = (q / 100) * npu;
  // find the vol shift that reprices the option to the quote
  let lo = -0.3;
  let hi = 0.6;
  const base = impliedVol(v, inst.asset, inst.strike, inst.expiry - v.t);
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    const vv = { ...v, smile: { ...v.smile, [inst.asset]: { ...v.smile[inst.asset], shift: (v.smile[inst.asset].shift ?? 0) + m } } };
    if (unitPV(inst, vv) > target) hi = m;
    else lo = m;
  }
  return base + 0.5 * (lo + hi);
}

function Terms({ r, g }: { r: Rfq; g: GameState }) {
  const v = view(g);
  const i = r.inst;
  const rows: [string, string][] = [];
  if (i.type === 'vanilla' || i.type === 'digital' || i.type === 'barrier') {
    const S = v.spot[i.asset];
    rows.push(['Spot', fmtStrike(i.asset, S)], ['Strike', `${fmtStrike(i.asset, i.strike)} (${((i.strike / S) * 100).toFixed(1)}%)`], ['Expiry', tenorLabel(i.expiry - v.t)]);
    if (i.type === 'barrier') rows.push(['Barrier', `${fmtStrike(i.asset, i.barrier)} (${((i.barrier / S) * 100).toFixed(1)}%) ${i.dir}-and-${i.kind}`]);
    rows.push(['ATM vol', `${(atmImplied(v, i.asset, Math.max(i.expiry - v.t, 1 / 252)) * 100).toFixed(2)}`]);
    rows.push(['Strike vol', `${(impliedVol(v, i.asset, i.strike, Math.max(i.expiry - v.t, 1 / 252)) * 100).toFixed(2)}`]);
  } else if (i.type === 'autocall') {
    rows.push(['Underlyings', i.assets.map((a) => SPECS[a].name).join(' / ')], ['Tenor', `${((i.obs[i.obs.length - 1] - v.t)).toFixed(1)}Y, quarterly`], ['Autocall trigger', `${(i.autocall * 100).toFixed(0)}% from obs ${i.callFrom + 1}`], ['Coupon barrier', `${(i.couponBarrier * 100).toFixed(0)}%${i.memory ? ' with memory' : ''}`], ['Knock-in (European)', `${(i.ki * 100).toFixed(0)}%`]);
    rows.push(['Implied corr', `${(v.eqCorr * 100).toFixed(0)}`]);
  } else if (i.type === 'swap') {
    rows.push(['Tenor', `${Math.round(i.end - i.start)}Y`], ['Client', r.clientSide === 'receives' ? 'receives fixed' : 'pays fixed'], ['Par rate', `${(quoteForEdge(r, 0, v)).toFixed(3)}%`]);
  } else if (i.type === 'forward') {
    rows.push(['Spot', v.spot.EURUSD.toFixed(4)], ['Tenor', tenorLabel(i.expiry - v.t)], ['Fair forward', quoteForEdge(r, 0, v).toFixed(4)]);
  }
  return (
    <div className="kv" style={{ marginTop: 10 }}>
      {rows.map(([a, b]) => (
        <Fragment key={a}><span>{a}</span><span>{b}</span></Fragment>
      ))}
    </div>
  );
}

function RiskDelta({ tradeRisk, before, after, und }: { r: Rfq; tradeRisk: Risk; before: Risk; after: Risk; und: AssetId[] }) {
  const rows: [string, number, number, number][] = [];
  const names = und.length ? und : [];
  for (const a of names) {
    rows.push([`Δ ${SPECS[a].name}`, before.delta[a], tradeRisk.delta[a], after.delta[a]]);
    if (a !== 'EURUSD' || und.length === 1) rows.push([`Γ ${SPECS[a].name}`, before.gamma[a], tradeRisk.gamma[a], after.gamma[a]]);
    rows.push([`ν ${SPECS[a].name}`, before.vega[a], tradeRisk.vega[a], after.vega[a]]);
  }
  rows.push(['Θ / day', before.theta, tradeRisk.theta, after.theta]);
  if (Math.abs(tradeRisk.dv01) > 100) rows.push(['DV01', before.dv01, tradeRisk.dv01, after.dv01]);
  if (Math.abs(tradeRisk.corr01) > 1) rows.push(['ρ / pt', before.corr01, tradeRisk.corr01, after.corr01]);
  return (
    <table className="t">
      <thead><tr><th>$</th><th>Book</th><th>Trade</th><th>After</th></tr></thead>
      <tbody>
        {rows.map(([l, b, t, a]) => (
          <tr key={l}><td>{l}</td><td>{kfmt(b)}</td><td className={pnlCls(t)}>{kfmt(t)}</td><td>{kfmt(a)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function LimitAfter({ label, before, after, limit }: { label: string; before: number; after: number; limit: number }) {
  return (
    <div className="limitrow">
      <span className="muted">{label}</span>
      <div style={{ position: 'relative' }}>
        <Meter value={after / limit} />
        <span style={{ position: 'absolute', top: -2, height: 10, width: 2, background: 'var(--ink2)', left: `${Math.min(100, (before / limit) * 100)}%` }} />
      </div>
      <span className={`mono ${after > limit ? 'down' : after / limit > 0.8 ? 'warn' : ''}`} style={{ textAlign: 'right' }}>{((after / limit) * 100).toFixed(0)}%</span>
    </div>
  );
}

function TraderRead({ r, tradeRisk, g, und }: { r: Rfq; tradeRisk: Risk; g: GameState; und: AssetId[] }) {
  const lines: string[] = [];
  const gam = EQUITIES.reduce((s, a) => s + tradeRisk.gamma[a], 0);
  const veg = ASSETS.reduce((s, a) => s + tradeRisk.vega[a], 0);
  if (Math.abs(gam) > 500) lines.push(gam < 0 ? `Short gamma ${kfmt(gam)}: you collect ${kfmt(tradeRisk.theta)}/day and lose on big moves either way.` : `Long gamma ${kfmt(gam)}: big moves pay you; it costs ${kfmt(-tradeRisk.theta)}/day in theta.`);
  for (const a of und) {
    const b = g.book.risk.vega[a];
    const t = tradeRisk.vega[a];
    if (Math.abs(t) > 2000 && Math.abs(b) > 2000) lines.push(Math.sign(b) === Math.sign(t) ? `Adds to your existing ${SPECS[a].name} ${b > 0 ? 'long' : 'short'} vega (${kfmt(b)} → ${kfmt(b + t)}).` : `Offsets your existing ${SPECS[a].name} vega (${kfmt(b)} → ${kfmt(b + t)}). Natural flow like this is worth tightening for.`);
  }
  if (Math.abs(veg) > 1000 && !lines.some((l) => l.includes('vega'))) lines.push(`${veg > 0 ? 'Long' : 'Short'} ${kfmt(Math.abs(veg))} of vega per vol point.`);
  if (Math.abs(tradeRisk.corr01) > 100) lines.push(`Correlation: ${kfmt(tradeRisk.corr01)} per point. Nothing on screen hedges this.`);
  const ev = g.market.events.find((e) => e.status === 'pending' && und.some((a) => e.moveStd[a]) && e.day <= g.market.day + 2);
  if (ev) lines.push(`Event risk: ${ev.title} (D${ev.day + 1}) is priced into these vols.`);
  if (r.inst.type === 'barrier') {
    const S = view(g).spot[r.inst.asset];
    lines.push(`Barrier is ${(((r.inst.barrier / S) - 1) * 100).toFixed(1)}% away. The risk changes sharply near it.`);
  }
  if (!lines.length) return null;
  return (
    <div className="col" style={{ marginTop: 10, gap: 6 }}>
      {lines.map((l, i) => (
        <div key={i} className="note-card"><i />{l}</div>
      ))}
    </div>
  );
}

function PayoffCard({ r, g }: { r: Rfq; g: GameState }) {
  const v = view(g);
  const inst = r.inst as Extract<Rfq['inst'], { type: 'vanilla' | 'digital' | 'barrier' }>;
  const a = inst.asset;
  const S = v.spot[a];
  const data = useMemo(() => {
    const today: [number, number][] = [];
    const expiry: [number, number][] = [];
    const base = unitPV(inst, v) * r.deskQty;
    for (let k = -20; k <= 20; k++) {
      const m = k / 100;
      const vv = bumpSpot(v, a, m);
      today.push([m * 100, unitPV(inst, vv) * r.deskQty - base]);
      const ST = S * (1 + m);
      let pay = 0;
      if (inst.type === 'vanilla') pay = Math.max(inst.cp === 'C' ? ST - inst.strike : inst.strike - ST, 0);
      else if (inst.type === 'digital') pay = (inst.cp === 'C' ? ST > inst.strike : ST < inst.strike) ? 1 : 0;
      else {
        const hit = inst.dir === 'down' ? ST <= inst.barrier : ST >= inst.barrier;
        const alive = inst.kind === 'in' ? hit : !hit;
        pay = alive ? Math.max(inst.cp === 'C' ? ST - inst.strike : inst.strike - ST, 0) : 0;
      }
      const conv = SPECS[a].ccy === 'EUR' ? v.spot.EURUSD : 1;
      expiry.push([m * 100, pay * conv * r.deskQty - base]);
    }
    return { today, expiry };
  }, [g.market.t, r.id]);
  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="micro">Desk P&L vs {SPECS[a].name} move (at mid, before hedges)</span>
      </div>
      <LineChart
        height={150}
        zeroLine
        series={[
          { data: data.today, color: COLORS.acc, label: 'Today (model)' },
          { data: data.expiry, color: COLORS.violet, dash: '4 3', label: 'At expiry*', width: 1.4 },
        ]}
        xFmt={(x) => `${x > 0 ? '+' : ''}${x.toFixed(0)}%`}
        yFmt={(y) => kfmt(y)}
        legend
      />
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>*Barrier at expiry assumes the terminal level is the only level touched. The curvature of the "today" line is gamma.</div>
    </div>
  );
}

function NoteAnalytics({ r, g, coupon }: { r: Rfq; g: GameState; coupon: number }) {
  const v = view(g);
  const inst = r.inst as AutocallInst;
  const res = useMemo(() => autocallMC({ ...inst, coupon: coupon / 100 / periodsPerYear(inst) }, v, 4096), [g.market.t, r.id, Math.round(coupon * 20)]);
  const callCum = res.callProb.reduce<number[]>((acc, p) => [...acc, (acc[acc.length - 1] ?? 0) + p], []);
  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 8 }}>
        <span className="micro">Note analytics at your coupon</span>
        <button className="pill" style={{ height: 26, fontSize: 11.5 }} onClick={() => store.lab('rfq:' + r.id)}>Open in Lab</button>
      </div>
      <div className="grid3">
        <div className="stat"><div className="micro">Note PV</div><div className="v">{(res.pv * 100).toFixed(2)}%</div><div className="s">±{(res.stdErr * 200).toFixed(2)}% (2σ MC)</div></div>
        <div className="stat"><div className="micro">P(knock-in)</div><div className="v">{(res.kiProb * 100).toFixed(1)}%</div><div className="s">investor loses capital</div></div>
        <div className="stat"><div className="micro">Exp. life</div><div className="v">{res.expLife.toFixed(2)}y</div><div className="s">of {(inst.obs[inst.obs.length - 1] - v.t).toFixed(1)}y</div></div>
      </div>
      <div className="micro" style={{ margin: '10px 0 4px' }}>Cumulative autocall probability by observation</div>
      <div className="row" style={{ alignItems: 'flex-end', height: 60, gap: 3 }}>
        {callCum.map((p, i) => (
          <div key={i} title={`${(p * 100).toFixed(0)}%`} style={{ flex: 1, height: `${Math.max(2, p * 100)}%`, background: i < inst.callFrom ? COLORS.ink4 : COLORS.acc, opacity: 0.35 + 0.65 * p, borderRadius: 3 }} />
        ))}
      </div>
      <div className="between muted" style={{ fontSize: 10.5, marginTop: 2 }}><span>Q1</span><span>Q{callCum.length}</span></div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Flat vols {res.vols.map((x, i) => `${SPECS[inst.assets[i]].name} ${(x * 100).toFixed(1)}`).join(', ')}. Discounted at the curve + {(v.fundingSpread * 1e4).toFixed(0)}bp issuer funding. <LearnLink topic="autocall" />
      </div>
    </div>
  );
}
