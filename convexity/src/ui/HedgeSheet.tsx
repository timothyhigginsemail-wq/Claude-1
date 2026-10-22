import { useMemo, useState } from 'react';
import { GameState, acceptAxe, liquidity, streetTrade, view, absNow } from '../engine/game';
import { ASSETS, AssetId, SPECS, atmImplied, impliedVol } from '../engine/market';
import { Instrument, describeInstrument, unitPV } from '../engine/pricing';
import { halfSpread, tenorLabel } from '../engine/book';
import { hedgeUniverse, listedStrike, optionExpiries, proposeHedges, freshen } from '../engine/hedging';
import { addRisk, instrumentRisk, scaleRisk, zeroRisk } from '../engine/risk';
import { notionalPerUnit } from '../engine/clients';
import { store } from './store';
import { LearnLink, Seg, Sheet, Tabs, kfmt, usd } from './common';

export function HedgeSheet({ g }: { g: GameState }) {
  const [tab, setTab] = useState<'suggest' | 'ticket' | 'auto'>('suggest');
  return (
    <Sheet title="Hedge" sub={`Liquidity ×${liquidity(g).toFixed(1)} · spreads ${liquidity(g) > 1.5 ? 'WIDE' : 'normal'}`} right={<LearnLink topic="hedgecost" label="Costs" />}>
      <Tabs value={tab} onChange={setTab} options={[['suggest', 'Suggested'], ['ticket', 'Ticket'], ['auto', 'Auto-hedge']]} />
      {tab === 'suggest' && <Suggested g={g} />}
      {tab === 'ticket' && <TicketTab g={g} />}
      {tab === 'auto' && <AutoTab g={g} />}
    </Sheet>
  );
}

const lbl = (g: GameState) => (i: Instrument) => describeInstrument(i, (t) => tenorLabel(t - view(g).t));

function Suggested({ g }: { g: GameState }) {
  const v = view(g);
  const props = useMemo(() => proposeHedges(g.book, v, g.market.day, liquidity(g), lbl(g)), [g.market.t, g.book.trades.length]);
  const axes = g.axes.filter((a) => a.status === 'open');
  return (
    <>
      {axes.map((a) => (
        <div key={a.id} className="card" style={{ borderColor: 'rgba(166,140,255,.4)' }}>
          <div className="between"><span className="micro" style={{ color: 'var(--violet)' }}>Inter-desk axe · Theo</span><span className="mono muted" style={{ fontSize: 11 }}>{(a.expires - absNow(g)) * 5}m left</span></div>
          <div style={{ margin: '6px 0' }}>Theo {a.theoBuys ? 'buys' : 'sells'} {usd(a.vega)} vega of {SPECS[a.asset].name} 3M ATM, {a.volEdge >= 0 ? `${a.volEdge.toFixed(2)} vol better than mid` : `${(-a.volEdge).toFixed(2)} vol through mid`}. Your {SPECS[a.asset].name} vega: {kfmt(g.book.risk.vega[a.asset])}.</div>
          <button className="btn sm primary" onClick={() => store.act((g) => acceptAxe(g, a.id))}>{a.theoBuys ? 'Sell vega to Theo' : 'Buy vega from Theo'}</button>
        </div>
      ))}
      {!props.length && <div className="card muted">The book is close to flat. Nothing large enough to suggest. Use the ticket to take a view.</div>}
      {props.map((p) => (
        <div key={p.id} className="card">
          <div className="between" style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>{p.title}</span>
            <span className="mono down" style={{ fontSize: 12.5 }}>cost ≈ {usd(p.cost)}</span>
          </div>
          <div className="dim" style={{ fontSize: 13, marginBottom: 8 }}>{p.why}</div>
          {p.legs.map((l, i) => (
            <div key={i} className="between" style={{ fontSize: 12.5, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
              <span>{l.qty > 0 ? 'BUY' : 'SELL'} {l.label}</span>
              <span className="mono muted">{usd(Math.abs(l.qty) * notionalPerUnit(l.inst, v))}</span>
            </div>
          ))}
          <button
            className="btn sm"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => {
              store.act((g) => {
                for (const l of p.legs) streetTrade(g, l.inst, l.qty);
              });
              store.toast(`${p.title} executed`);
            }}
          >
            Execute
          </button>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 12 }}>
        Delta hedges remove first-order risk only. Gamma and vega need options. Jumps go straight through delta hedges, and correlation has no listed hedge at all.
      </div>
    </>
  );
}

type Kind = 'd1' | 'opt' | 'swap';

function TicketTab({ g }: { g: GameState }) {
  const v = view(g);
  const [kind, setKind] = useState<Kind>('d1');
  const [asset, setAsset] = useState<AssetId>('ORX');
  const [cp, setCp] = useState<'C' | 'P'>('P');
  const [mny, setMny] = useState(1);
  const [exp, setExp] = useState(1);
  const [tenor, setTenor] = useState(5);
  const [side, setSide] = useState<1 | -1>(1);
  const [size, setSize] = useState(10);
  const univ = hedgeUniverse(v, g.market.day);
  const exps = optionExpiries(g.market.day);
  let inst: Instrument;
  if (kind === 'd1') inst = univ.find((h) => h.group === 'Delta-one' && h.asset === asset)!.inst;
  else if (kind === 'opt') inst = { type: 'vanilla', asset, cp, strike: listedStrike(asset, v.spot[asset] * mny), expiry: exps[exp] };
  else inst = freshen({ type: 'swap', start: v.t, end: v.t + tenor, fixed: 0, paid: 0 }, v);
  const npu = notionalPerUnit(inst, v);
  const qty = (side * size * 1e6) / npu;
  const unit = useMemo(() => instrumentRisk(freshen(inst, v), v), [JSON.stringify(inst), g.market.t]);
  const tr = scaleRisk(unit, qty);
  const after = zeroRisk();
  addRisk(after, g.book.risk, 1);
  addRisk(after, tr, 1);
  const hs = halfSpread(inst, qty, v, liquidity(g), unit);
  const mid = unitPV(freshen(inst, v), v);
  const rows: [string, number, number][] = [];
  const show: AssetId[] = kind === 'swap' ? [] : asset === 'AUR' ? ['AUR', 'EURUSD'] : [asset];
  for (const a of show) {
    rows.push([`Δ ${SPECS[a].name}`, g.book.risk.delta[a], after.delta[a]]);
    if (kind === 'opt') rows.push([`Γ ${SPECS[a].name}`, g.book.risk.gamma[a], after.gamma[a]], [`ν ${SPECS[a].name}`, g.book.risk.vega[a], after.vega[a]]);
  }
  if (kind === 'opt') rows.push(['Θ', g.book.risk.theta, after.theta]);
  if (kind === 'swap') rows.push(['DV01', g.book.risk.dv01, after.dv01]);
  return (
    <>
      <Seg value={kind} onChange={setKind} options={[['d1', 'Delta-one'], ['opt', 'Listed option'], ['swap', 'Swap']]} />
      {kind !== 'swap' && <Seg value={asset} onChange={setAsset} options={ASSETS.map((a) => [a, SPECS[a].name] as [AssetId, string])} />}
      {kind === 'opt' && (
        <>
          <div className="grid2">
            <Seg value={cp} onChange={setCp} options={[['P', 'Put'], ['C', 'Call']]} />
            <Seg value={exp} onChange={setExp} options={exps.map((e, i) => [i, tenorLabel(e - v.t)] as [number, string])} />
          </div>
          <div className="field">
            <label>Strike {listedStrike(asset, v.spot[asset] * mny)} · {(mny * 100).toFixed(0)}% of spot · vol {(impliedVol(v, asset, listedStrike(asset, v.spot[asset] * mny), exps[exp] - v.t) * 100).toFixed(2)} (ATM {(atmImplied(v, asset, exps[exp] - v.t) * 100).toFixed(2)})</label>
            <input type="range" min={0.8} max={1.2} step={0.01} value={mny} onChange={(e) => setMny(Number(e.target.value))} />
          </div>
        </>
      )}
      {kind === 'swap' && <Seg value={tenor} onChange={setTenor} options={[[2, '2Y'], [5, '5Y'], [10, '10Y']]} />}
      <div className="grid2">
        <Seg value={side} onChange={setSide} options={[[1, kind === 'swap' ? 'Receive' : 'Buy'], [-1, kind === 'swap' ? 'Pay' : 'Sell']]} />
        <div className="field">
          <input className="input" type="number" inputMode="decimal" value={size} min={0} onChange={(e) => setSize(Math.max(0, Number(e.target.value)))} />
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>Size in $m notional{kind === 'opt' ? ' (underlying)' : ''}. Mid {kind === 'opt' ? `${((mid / npu) * 100).toFixed(3)}%` : kind === 'swap' ? `${(((inst as { fixed: number }).fixed) * 100).toFixed(3)}%` : mid.toFixed(SPECS[asset].decimals)}.</div>
      <div className="card">
        <table className="t">
          <thead><tr><th>Risk</th><th>Now</th><th>After</th></tr></thead>
          <tbody>{rows.map(([l, a, b]) => (<tr key={l}><td>{l}</td><td>{kfmt(a)}</td><td>{kfmt(b)}</td></tr>))}</tbody>
        </table>
        <div className="between" style={{ marginTop: 8, fontSize: 13 }}>
          <span className="muted">Crossing cost</span>
          <span className="mono down">{usd(Math.abs(qty) * hs)}</span>
        </div>
      </div>
      <button className="btn primary" disabled={size <= 0} onClick={() => { store.act((g) => streetTrade(g, inst, qty)); store.toast('Executed'); }}>
        {side > 0 ? (kind === 'swap' ? 'Receive' : 'Buy') : kind === 'swap' ? 'Pay' : 'Sell'} {usd(size * 1e6)}
      </button>
    </>
  );
}

function AutoTab({ g }: { g: GameState }) {
  const s = g.settings.autoHedge;
  return (
    <>
      <div className="card dim" style={{ fontSize: 13 }}>
        Band hedging: when a name's delta leaves the band, the desk trades delta-one back to flat at street spreads. Tight bands mean less risk and more cost. Wide bands mean less cost and more P&L variance. None of it touches gamma, vega or correlation.
      </div>
      {ASSETS.map((a) => (
        <div key={a} className="card">
          <div className="between">
            <span style={{ fontWeight: 600 }}>{SPECS[a].long}</span>
            <Seg value={s[a].on ? 1 : 0} onChange={(x) => store.act((g) => (g.settings.autoHedge[a].on = x === 1))} options={[[0, 'Off'], [1, 'On']]} />
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Band ± {usd(s[a].band)} per 1% · now {kfmt(g.book.risk.delta[a])}</label>
            <input type="range" min={20e3} max={1e6} step={10e3} value={s[a].band} onChange={(e) => store.act((g) => (g.settings.autoHedge[a].band = Number(e.target.value)))} />
          </div>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 12 }}>Auto-hedges so far: {g.flags.autoHedges ?? 0}</div>
    </>
  );
}
