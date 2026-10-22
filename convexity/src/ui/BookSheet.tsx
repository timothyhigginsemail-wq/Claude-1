import { Fragment, useMemo, useState } from 'react';
import { GameState, closePosition, fmtQuote, liquidity, view } from '../engine/game';
import { ASSETS, AssetId, DAY, SPECS } from '../engine/market';
import { bookValue, halfSpread, positionPnl, tenorLabel, Position } from '../engine/book';
import { clientById, notionalPerUnit } from '../engine/clients';
import { AutocallInst, autocallMC, unitPV, periodsPerYear } from '../engine/pricing';
import { bumpSpot } from '../engine/risk';
import { store } from './store';
import { LearnLink, Sheet, Tabs, kfmt, pnlCls, sgnUsd, usd } from './common';
import { COLORS, LineChart } from './charts';

export function BookSheet({ g }: { g: GameState }) {
  const [tab, setTab] = useState<'pos' | 'rfq' | 'blotter'>('pos');
  const total = bookValue(g.book);
  const unreal = g.book.positions.reduce((a, p) => a + p.qty * (p.unitPv - p.avgPx), 0);
  const L = g.book.life;
  return (
    <Sheet title="Book" sub={`${g.book.positions.length} positions · ${g.rfqs.filter((r) => r.status === 'open').length} live RFQs`}>
      <div className="grid3">
        <div className="stat"><div className="micro">Total P&L</div><div className={`v ${pnlCls(total)}`}>{sgnUsd(total)}</div><div className="s">since start</div></div>
        <div className="stat"><div className="micro">Realised</div><div className={`v ${pnlCls(total - unreal)}`}>{sgnUsd(total - unreal)}</div><div className="s">cash in hand</div></div>
        <div className="stat"><div className="micro">Unrealised</div><div className={`v ${pnlCls(unreal)}`}>{sgnUsd(unreal)}</div><div className="s">open MTM</div></div>
      </div>
      <div className="grid2">
        <div className="stat"><div className="micro">Client revenue</div><div className="v up">{sgnUsd(L.edge)}</div><div className="s">day-one edge, life</div></div>
        <div className="stat"><div className="micro">Transaction costs</div><div className="v down">{sgnUsd(L.costs)}</div><div className="s">carry {sgnUsd(L.carry)} · market {sgnUsd(L.market)}</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} options={[['pos', 'Positions'], ['rfq', 'RFQs'], ['blotter', 'Blotter']]} />
      {tab === 'pos' && <Positions g={g} />}
      {tab === 'rfq' && <Rfqs g={g} />}
      {tab === 'blotter' && <Blotter g={g} />}
    </Sheet>
  );
}

function Positions({ g }: { g: GameState }) {
  const v = view(g);
  const groups: [string, Position[]][] = [
    ['Client trades', g.book.positions.filter((p) => p.source === 'client')],
    ['Hedges & inter-desk', g.book.positions.filter((p) => p.source !== 'client')],
  ];
  if (!g.book.positions.length) return <div className="card muted">No positions yet. Win an RFQ, or put on a view from the Hedge ticket.</div>;
  return (
    <>
      {groups.map(([title, ps]) =>
        ps.length ? (
          <div key={title} className="col" style={{ gap: 6 }}>
            <span className="micro">{title}</span>
            <div className="poslist">
              {ps.map((p) => {
                const n = Math.abs(p.qty) * notionalPerUnit(p.inst, v);
                return (
                  <button key={p.id} className="posrow" onClick={() => store.open('position', p.id)}>
                    <div className="l">{p.label}</div>
                    <div className={`r ${pnlCls(positionPnl(p))}`}>{sgnUsd(positionPnl(p))}</div>
                    <div className="s">{p.qty > 0 ? 'Long' : 'Short'} {usd(n)} · {p.client ? clientById(p.client).name : p.source}</div>
                    <div className={`s mono ${pnlCls(p.pnlDay)}`} style={{ textAlign: 'right' }}>today {sgnUsd(p.pnlDay)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </>
  );
}

function Rfqs({ g }: { g: GameState }) {
  const list = g.rfqs.slice().reverse();
  if (!list.length) return <div className="card muted">No RFQs yet today.</div>;
  return (
    <div className="poslist">
      {list.map((r) => (
        <button key={r.id} className="posrow" onClick={() => store.open('rfq', r.id)}>
          <div className="l">{clientById(r.client).name}</div>
          <div className={`r ${r.status === 'won' ? 'up' : r.status === 'open' ? 'acc' : 'muted'}`} style={{ fontFamily: 'var(--sans)', fontSize: 12 }}>{r.status.toUpperCase()}</div>
          <div className="s">{r.clientSide} {usd(r.notional)} · {r.template.replace('_', ' ')}</div>
          <div className="s mono" style={{ textAlign: 'right' }}>{r.quote !== undefined ? fmtQuote(r, r.quote) : ''}</div>
        </button>
      ))}
    </div>
  );
}

function Blotter({ g }: { g: GameState }) {
  const t = g.book.trades.slice().reverse().slice(0, 80);
  if (!t.length) return <div className="card muted">No executions yet.</div>;
  return (
    <div className="card scrollx">
      <table className="t">
        <thead><tr><th>Trade</th><th>Time</th><th>Side</th><th>Edge/cost</th></tr></thead>
        <tbody>
          {t.map((x) => (
            <tr key={x.id}>
              <td style={{ whiteSpace: 'normal', maxWidth: 170 }}>{x.label}<div className="muted" style={{ fontSize: 10.5 }}>{x.client ? clientById(x.client).name : x.source}</div></td>
              <td>D{x.day + 1} {String(Math.floor((480 + x.tick * 5) / 60)).padStart(2, '0')}:{String((480 + x.tick * 5) % 60).padStart(2, '0')}</td>
              <td>{x.qty > 0 ? 'BUY' : 'SELL'}</td>
              <td className={pnlCls(x.edge)}>{sgnUsd(x.edge)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- position detail

export function PositionSheet({ g, id }: { g: GameState; id: string }) {
  const p = g.book.positions.find((x) => x.id === id) ?? g.book.closed.find((x) => x.id === id);
  if (!p) return <Sheet title="Position">This position no longer exists.</Sheet>;
  const v = view(g);
  const open = g.book.positions.includes(p);
  const npu = notionalPerUnit(p.inst, v);
  const notional = Math.abs(p.qty) * npu;
  const r = p.risk;
  const cost = open ? Math.abs(p.qty) * halfSpread(p.inst, -p.qty, v, liquidity(g), r) : 0;
  const assets: AssetId[] = p.inst.type === 'autocall' ? p.inst.assets : p.inst.type === 'swap' ? [] : [p.inst.asset];
  const topic = { vanilla: 'vanilla', barrier: 'barrier', digital: 'digital', autocall: 'autocall', swap: 'swap', forward: 'fxfwd', spot: 'delta' }[p.inst.type];
  return (
    <Sheet
      title={p.label}
      sub={`${p.qty > 0 ? 'Long' : 'Short'} ${usd(notional)} · ${p.client ? clientById(p.client).name : p.source}${open ? '' : ' · closed'}`}
      right={<LearnLink topic={topic} label="Learn" />}
      foot={open ? (
        <button className="btn danger grow" onClick={() => { store.act((g) => closePosition(g, p.id)); store.open('book'); store.toast('Position unwound at street'); }}>
          Unwind at street · cost ≈ {usd(cost)}
        </button>
      ) : undefined}
    >
      <div className="grid3">
        <div className="stat"><div className="micro">P&L</div><div className={`v ${pnlCls(positionPnl(p))}`}>{sgnUsd(positionPnl(p))}</div><div className="s">day-one {sgnUsd(p.edge)}</div></div>
        <div className="stat"><div className="micro">Today</div><div className={`v ${pnlCls(p.pnlDay)}`}>{sgnUsd(p.pnlDay)}</div><div className="s">attributed</div></div>
        <div className="stat"><div className="micro">MTM</div><div className="v">{usd(p.qty * p.unitPv)}</div><div className="s">{p.inst.type === 'autocall' || p.inst.type === 'digital' ? `${(p.unitPv * 100).toFixed(2)}%` : p.inst.type === 'swap' ? '' : `${((p.unitPv / npu) * 100).toFixed(3)}% ntl`}</div></div>
      </div>
      {r && (
        <div className="card">
          <div className="micro" style={{ marginBottom: 6 }}>Position risk ($)</div>
          <table className="t">
            <thead><tr><th></th><th>Δ /1%</th><th>Γ /1%</th><th>vega/pt</th><th>vanna</th></tr></thead>
            <tbody>
              {(assets.length ? assets : []).concat(assets.includes('AUR') && !assets.includes('EURUSD') ? ['EURUSD'] : []).map((a) => (
                <tr key={a}><td>{SPECS[a].name}</td><td>{kfmt(r.delta[a] * p.qty)}</td><td>{kfmt(r.gamma[a] * p.qty)}</td><td>{kfmt(r.vega[a] * p.qty)}</td><td>{kfmt(r.vanna[a] * p.qty)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="kv" style={{ marginTop: 8 }}>
            <span>Theta / day</span><span className={pnlCls(r.theta * p.qty)}>{sgnUsd(r.theta * p.qty)}</span>
            <span>DV01</span><span>{kfmt(r.dv01 * p.qty)}</span>
            {Math.abs(r.corr01) > 0 && <span>Correlation / pt</span>}{Math.abs(r.corr01) > 0 && <span>{kfmt(r.corr01 * p.qty)}</span>}
          </div>
        </div>
      )}
      <Lifecycle g={g} p={p} />
      {open && assets.length > 0 && <Profile g={g} p={p} />}
    </Sheet>
  );
}

function Lifecycle({ g, p }: { g: GameState; p: Position }) {
  const v = view(g);
  const i = p.inst;
  if (i.type === 'barrier' || i.type === 'vanilla' || i.type === 'digital') {
    const S = v.spot[i.asset];
    return (
      <div className="card kv">
        <span>Spot / strike</span><span>{((S / i.strike) * 100).toFixed(1)}%</span>
        <span>Time to expiry</span><span>{tenorLabel(i.expiry - v.t)} ({Math.max(0, Math.round((i.expiry - v.t) / DAY))}d)</span>
        {i.type === 'barrier' && (<><span>Barrier distance</span><span className={Math.abs(S / i.barrier - 1) < 0.03 ? 'warn' : ''}>{((i.barrier / S - 1) * 100).toFixed(2)}% {i.hit ? '(HIT)' : ''}</span></>)}
      </div>
    );
  }
  if (i.type === 'autocall') return <NoteLife g={g} inst={i} p={p} />;
  if (i.type === 'swap') return (
    <div className="card kv">
      <span>Fixed rate</span><span>{(i.fixed * 100).toFixed(3)}%</span>
      <span>Remaining</span><span>{(i.end - v.t).toFixed(2)}y</span>
      <span>Side</span><span>{p.qty > 0 ? 'receive fixed' : 'pay fixed'}</span>
    </div>
  );
  return null;
}

function NoteLife({ g, inst, p }: { g: GameState; inst: AutocallInst; p: Position }) {
  const v = view(g);
  const res = useMemo(() => autocallMC(inst, v, 4096), [g.market.t, p.id]);
  const perf = inst.assets.map((a, k) => v.spot[a] / inst.initial[k]);
  const worst = Math.min(...perf);
  const nextT = inst.obs[inst.next];
  return (
    <div className="card">
      <div className="micro" style={{ marginBottom: 6 }}>Note lifecycle</div>
      <div className="kv">
        {inst.assets.map((a, k) => (<Fragment key={a}><span>{SPECS[a].name} vs initial</span><span className={perf[k] < inst.couponBarrier ? 'down' : ''}>{(perf[k] * 100).toFixed(1)}%</span></Fragment>))}
        <span>Worst-of</span><span className={worst < inst.ki ? 'down' : worst < inst.couponBarrier ? 'warn' : ''}>{(worst * 100).toFixed(1)}%</span>
        <span>Next observation</span><span>{nextT ? `${Math.max(0, Math.round((nextT - v.t) / DAY))} trading days` : '—'}</span>
        <span>Coupon</span><span>{(inst.coupon * periodsPerYear(inst) * 100).toFixed(2)}% p.a.{inst.missed ? ` · ${inst.missed} missed (memory)` : ''}</span>
        <span>P(called next obs)</span><span>{((res.callProb[0] ?? 0) * 100).toFixed(1)}%</span>
        <span>P(knock-in at maturity)</span><span>{(res.kiProb * 100).toFixed(1)}%</span>
        <span>Expected life</span><span>{res.expLife.toFixed(2)}y</span>
      </div>
      <div className="row" style={{ marginTop: 10, gap: 4 }}>
        {[['KI', inst.ki], ['Coupon', inst.couponBarrier], ['Call', inst.autocall]].map(([l, b]) => (
          <div key={l as string} className="grow" style={{ fontSize: 11 }}>
            <div className="muted">{l} {((b as number) * 100).toFixed(0)}%</div>
            <div className="meter"><i style={{ width: `${Math.min(100, (worst / (b as number)) * 50)}%`, background: worst >= (b as number) ? COLORS.up : COLORS.down }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Profile({ g, p }: { g: GameState; p: Position }) {
  const v = view(g);
  const assets: AssetId[] = p.inst.type === 'autocall' ? p.inst.assets : p.inst.type === 'swap' ? [] : [p.inst.asset];
  const [focus, setFocus] = useState<AssetId | 'all'>(assets.length > 1 ? 'all' : assets[0]);
  const data = useMemo(() => {
    const out: [number, number][] = [];
    const dl: [number, number][] = [];
    const paths = p.inst.type === 'autocall' ? 2048 : undefined;
    const pv = (m: number) => {
      let vv = v;
      for (const a of focus === 'all' ? assets : [focus]) vv = bumpSpot(vv, a, m);
      return unitPV(p.inst, vv, paths) * p.qty;
    };
    const base = pv(0);
    const step = p.inst.type === 'autocall' ? 4 : 2;
    for (let k = -40; k <= 20; k += step) {
      const m = k / 100;
      const y = pv(m);
      out.push([k, y - base]);
    }
    for (let i = 1; i < out.length - 1; i++) dl.push([out[i][0], ((out[i + 1][1] - out[i - 1][1]) / (out[i + 1][0] - out[i - 1][0]))]);
    return { out, dl };
  }, [g.market.t, p.id, focus]);
  const barrier = p.inst.type === 'barrier' ? (p.inst.barrier / v.spot[p.inst.asset] - 1) * 100 : p.inst.type === 'autocall' ? (Math.min(...p.inst.assets.map((a, k) => (p.inst as AutocallInst).initial[k] * (p.inst as AutocallInst).ki / v.spot[a])) - 1) * 100 : null;
  return (
    <div className="card">
      <div className="between" style={{ marginBottom: 6 }}>
        <span className="micro">P&L profile vs spot (full revaluation)</span>
        {assets.length > 1 && (
          <div className="row" style={{ gap: 4 }}>
            {(['all', ...assets] as const).map((a) => (
              <button key={a} className={`pill ${focus === a ? 'on' : ''}`} style={{ height: 24, fontSize: 11 }} onClick={() => setFocus(a)}>{a === 'all' ? 'All' : SPECS[a].name}</button>
            ))}
          </div>
        )}
      </div>
      <LineChart height={150} zeroLine series={[{ data: data.out, color: COLORS.acc, fill: true }]} xFmt={(x) => `${x.toFixed(0)}%`} yFmt={kfmt} vlines={barrier !== null ? [{ x: barrier, label: p.inst.type === 'autocall' ? 'KI' : 'barrier', color: COLORS.warn }] : []} />
      <div className="micro" style={{ margin: '8px 0 2px' }}>Delta ($ per 1%) across the same moves</div>
      <LineChart height={110} zeroLine series={[{ data: data.dl, color: COLORS.violet }]} xFmt={(x) => `${x.toFixed(0)}%`} yFmt={kfmt} />
      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Vols and correlation held fixed. Real moves drag vol and correlation with them. The Risk sheet's spot × vol grid shows the joint effect.</div>
    </div>
  );
}

export const unused = ASSETS;
