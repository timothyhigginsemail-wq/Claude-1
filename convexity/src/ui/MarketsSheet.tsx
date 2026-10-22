import { useState } from 'react';
import { GameState, view } from '../engine/game';
import { ASSETS, AssetId, REGIMES, SPECS, atmImplied, forward, impliedVol, parSwapRate, zeroRate, clockLabel } from '../engine/market';
import { realizedVolFromCloses } from '../engine/clients';
import { EVENT_INFO } from '../engine/events';
import { store } from './store';
import { LearnLink, Sheet, Tabs, pct } from './common';
import { COLORS, Heatmap, LineChart, Sparkline } from './charts';

type Tab = 'assets' | 'vol' | 'rates' | 'corr' | 'news';

export function MarketsSheet({ g, initial }: { g: GameState; initial?: string }) {
  const [tab, setTab] = useState<Tab>((initial as Tab) ?? 'assets');
  return (
    <Sheet title="Markets" sub={`${REGIMES[g.market.regime].label} regime · IG credit ${g.market.credit.toFixed(0)}bp`}>
      <Tabs value={tab} onChange={setTab} options={[['assets', 'Prices'], ['vol', 'Vol'], ['rates', 'Rates'], ['corr', 'Corr'], ['news', 'News']]} />
      {tab === 'assets' && <MarketsPanel g={g} />}
      {tab === 'vol' && <VolTab g={g} />}
      {tab === 'rates' && <RatesTab g={g} />}
      {tab === 'corr' && <CorrTab g={g} />}
      {tab === 'news' && <NewsTab g={g} />}
    </Sheet>
  );
}

export function MarketsPanel({ g, compact }: { g: GameState; compact?: boolean }) {
  const v = view(g);
  const m = g.market;
  const [sel, setSel] = useState<AssetId>('ORX');
  const rv = realizedVolFromCloses(m.closes, m.intraday);
  return (
    <>
      <div className="col" style={{ gap: 6 }}>
        {ASSETS.map((a) => {
          const s = m.assets[a];
          const ch = s.spot / s.prevClose - 1;
          const iv = atmImplied(v, a, 1 / 12);
          return (
            <button key={a} className="posrow" style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'center', borderColor: sel === a && !compact ? 'var(--line2)' : undefined }} onClick={() => (compact ? store.open('markets') : setSel(a))}>
              <div>
                <div className="l" style={{ fontWeight: 600 }}>{SPECS[a].name}</div>
                <div className="s">{SPECS[a].long}</div>
              </div>
              <Sparkline data={m.intraday[a]} base={s.prevClose} width={64} height={26} />
              <div style={{ textAlign: 'right', minWidth: 84 }}>
                <div className="mono" style={{ fontSize: 14 }}>{s.spot.toFixed(SPECS[a].decimals)}</div>
                <div className={`mono ${ch >= 0 ? 'up' : 'down'}`} style={{ fontSize: 11.5 }}>{pct(ch)} · v{(iv * 100).toFixed(1)}</div>
              </div>
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="card">
          <div className="card-title"><span className="micro">{SPECS[sel].long} · intraday</span><span className="mono muted" style={{ fontSize: 11 }}>RV {rv[sel] ? (rv[sel] * 100).toFixed(1) : '—'} · IV1M {(atmImplied(v, sel, 1 / 12) * 100).toFixed(1)}</span></div>
          <LineChart height={150} series={[{ data: m.intraday[sel].map((y, i) => [i, y]), color: COLORS.acc, fill: false }]} xFmt={(x) => clockLabel(Math.round(x)).slice(0, 5)} yFmt={(y) => y.toFixed(SPECS[sel].decimals > 2 ? 3 : 0)} hlines={[{ y: m.assets[sel].prevClose, label: 'prev close' }]} />
          {m.closes.length > 0 && <div className="micro" style={{ margin: '10px 0 4px' }}>Daily closes</div>}
          {m.closes.length > 0 && <LineChart height={110} series={[{ data: m.closes.map((c) => [c.day + 1, c.spot[sel]]).concat([[m.day + 1, m.assets[sel].spot]]) as [number, number][], color: COLORS.ink2 }]} xFmt={(x) => `D${x.toFixed(0)}`} yFmt={(y) => y.toFixed(SPECS[sel].decimals > 2 ? 3 : 0)} />}
        </div>
      )}
      {compact && <RegimeCard g={g} />}
      {compact && <Calendar g={g} />}
    </>
  );
}

function RegimeCard({ g }: { g: GameState }) {
  const m = g.market;
  const v = view(g);
  const credit = m.closes.map((c) => c.credit).concat([m.credit]);
  const slope = atmImplied(v, 'ORX', 0.25) - atmImplied(v, 'ORX', 1 / 12);
  return (
    <div className="card">
      <div className="card-title"><span className="micro">Regime signals</span><LearnLink topic="vrp" label="Vol premium" /></div>
      <div className="kv">
        <span>IG credit</span><span>{m.credit.toFixed(0)}bp</span>
        <span>ORX 3M−1M vol</span><span className={slope < 0 ? 'down' : ''}>{(slope * 100).toFixed(2)}</span>
        <span>Implied corr</span><span>{(v.eqCorr * 100).toFixed(0)}</span>
        <span>2s10s</span><span>{((parSwapRate(m.curve, 10) - parSwapRate(m.curve, 2)) * 1e4).toFixed(0)}bp</span>
      </div>
      {credit.length > 2 && <div style={{ marginTop: 8 }}><Sparkline data={credit} width={300} height={30} color={COLORS.warn} /></div>}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Rising credit spreads and an inverted vol curve tend to come before stress. Neither guarantees it.</div>
    </div>
  );
}

function Calendar({ g }: { g: GameState }) {
  const m = g.market;
  const ev = m.events.filter((e) => e.day >= m.day && e.day <= m.day + 5).sort((a, b) => a.day * 200 + a.tick - (b.day * 200 + b.tick));
  return (
    <div className="card">
      <div className="card-title"><span className="micro">Calendar</span><LearnLink topic="eventvol" label="Event vol" /></div>
      {!ev.length && <div className="muted" style={{ fontSize: 12.5 }}>Nothing scheduled this week.</div>}
      <div className="col" style={{ gap: 6 }}>
        {ev.map((e) => (
          <div key={e.id} className="between" style={{ fontSize: 12.5 }}>
            <span><span className="tag" style={{ marginRight: 6 }}>{EVENT_INFO[e.kind].short}</span>{e.title.split(' ·')[0]}</span>
            <span className={`mono ${e.status === 'done' ? 'muted' : ''}`}>D{e.day + 1} {clockLabel(e.tick)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolTab({ g }: { g: GameState }) {
  const v = view(g);
  const [a, setA] = useState<AssetId>('ORX');
  const tenors = [1 / 12, 0.25, 0.5, 1];
  const cols = [COLORS.acc, COLORS.up, COLORS.violet, COLORS.ink2];
  const lo = SPECS[a].kind === 'fx' ? 0.9 : 0.7;
  const hi = SPECS[a].kind === 'fx' ? 1.1 : 1.3;
  const smiles = tenors.map((T, i) => {
    const F = forward(v, a, T);
    const data: [number, number][] = [];
    for (let k = 0; k <= 30; k++) {
      const m = lo + ((hi - lo) * k) / 30;
      data.push([m * 100, impliedVol(v, a, F * m, T) * 100]);
    }
    return { data, color: cols[i], label: ['1M', '3M', '6M', '1Y'][i] };
  });
  const term: [number, number][] = [];
  for (let d = 5; d <= 504; d += 5) term.push([d / 21, atmImplied(v, a, d / 252) * 100]);
  const rv = realizedVolFromCloses(g.market.closes, g.market.intraday)[a];
  const pending = g.market.events.filter((e) => e.status === 'pending' && e.moveStd[a]);
  return (
    <>
      <div className="tabs">{ASSETS.map((x) => <button key={x} className={x === a ? 'on' : ''} onClick={() => setA(x)}>{SPECS[x].name}</button>)}</div>
      <div className="card">
        <div className="card-title"><span className="micro">Smile · implied vol vs strike (% of forward)</span><LearnLink topic="skew" label="Skew" /></div>
        <LineChart height={180} series={smiles} xFmt={(x) => `${x.toFixed(0)}`} yFmt={(y) => y.toFixed(1)} legend vlines={[{ x: 100 }]} />
      </div>
      <div className="card">
        <div className="card-title"><span className="micro">ATM term structure (months)</span><span className="mono muted" style={{ fontSize: 11 }}>{rv ? `realised ${(rv * 100).toFixed(1)}` : ''}</span></div>
        <LineChart height={150} series={[{ data: term, color: COLORS.acc }]} xFmt={(x) => `${x.toFixed(0)}M`} yFmt={(y) => y.toFixed(1)} hlines={rv ? [{ y: rv * 100, label: 'realised', color: COLORS.up }] : []} vlines={pending.map((e) => ({ x: Math.max(0, (e.day - g.market.day) / 21), label: (e.title.split(' ')[0]), color: COLORS.warn }))} />
        <div className="muted" style={{ fontSize: 11.5 }}>Kinks just after an event are the event variance. They disappear when it's released.</div>
      </div>
    </>
  );
}

function RatesTab({ g }: { g: GameState }) {
  const c = g.market.curve;
  const par: [number, number][] = [1, 2, 3, 5, 7, 10, 15, 20, 30].map((T) => [T, parSwapRate(c, T) * 100]);
  const zero: [number, number][] = [];
  for (let T = 0.25; T <= 30; T += 0.25) zero.push([T, zeroRate(c, T) * 100]);
  const h2 = g.market.closes.map((x) => [x.day + 1, x.r2 * 100] as [number, number]);
  const h10 = g.market.closes.map((x) => [x.day + 1, x.r10 * 100] as [number, number]);
  return (
    <>
      <div className="card">
        <div className="card-title"><span className="micro">USD curve</span><LearnLink topic="swap" label="Swaps" /></div>
        <LineChart height={170} series={[{ data: par, color: COLORS.acc, label: 'Par swap' }, { data: zero, color: COLORS.violet, dash: '4 3', label: 'Zero (cont.)', width: 1.3 }]} xFmt={(x) => `${x.toFixed(0)}Y`} yFmt={(y) => y.toFixed(2)} legend />
        <div className="kv" style={{ marginTop: 8 }}>
          <span>Short rate</span><span>{((c.b0 + c.b1) * 100).toFixed(3)}%</span>
          <span>2Y / 5Y / 10Y</span><span>{[2, 5, 10].map((T) => (parSwapRate(c, T) * 100).toFixed(3)).join(' / ')}</span>
          <span>EUR rate</span><span>{(g.market.eurRate * 100).toFixed(3)}%</span>
          <span>Bank funding spread</span><span>{(g.market.fundingSpread * 1e4).toFixed(0)}bp</span>
        </div>
      </div>
      {h2.length > 1 && (
        <div className="card">
          <div className="micro" style={{ marginBottom: 4 }}>2Y and 10Y history</div>
          <LineChart height={120} series={[{ data: h2, color: COLORS.acc, label: '2Y' }, { data: h10, color: COLORS.up, label: '10Y' }]} xFmt={(x) => `D${x.toFixed(0)}`} yFmt={(y) => y.toFixed(2)} legend />
        </div>
      )}
    </>
  );
}

function CorrTab({ g }: { g: GameState }) {
  const v = view(g);
  const names = ASSETS.map((a) => SPECS[a].name);
  const hist = g.market.closes.map((c) => [c.day + 1, c.corr * 100] as [number, number]).concat([[g.market.day + 1, g.market.corr * 100]]);
  return (
    <>
      <div className="card">
        <div className="card-title"><span className="micro">Implied correlation (pricing)</span><LearnLink topic="correlation" label="Correlation" /></div>
        <Heatmap rows={names} cols={names} values={v.corr} fmt={(x) => x.toFixed(2)} diverging />
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 4 }}>Realised equity correlation</div>
        <LineChart height={120} series={[{ data: hist, color: COLORS.violet }]} xFmt={(x) => `D${x.toFixed(0)}`} yFmt={(y) => y.toFixed(0)} />
        <div className="muted" style={{ fontSize: 11.5 }}>Implied = realised + {((v.eqCorr - g.market.corr) * 100).toFixed(0)}pt premium. In crashes correlation goes toward 1. A single-name blow-up sends it the other way.</div>
      </div>
    </>
  );
}

function NewsTab({ g }: { g: GameState }) {
  return (
    <>
      <RegimeCard g={g} />
      <Calendar g={g} />
      <div className="card">
        <div className="micro" style={{ marginBottom: 6 }}>Wire</div>
        {!g.news.length && <div className="muted" style={{ fontSize: 12.5 }}>Quiet tape.</div>}
        <div className="col" style={{ gap: 8 }}>
          {g.news.map((n) => (
            <div key={n.id} className="newsline" style={{ padding: 0 }}>
              <span className="t">D{n.day + 1} {clockLabel(n.tick)}</span>
              <span className="newsdot" style={{ background: n.tone === 'neg' ? 'var(--down)' : n.tone === 'pos' ? 'var(--up)' : 'var(--ink4)' }} />
              <span>{n.text}{n.tag === 'rumour' && <span className="tag warn" style={{ marginLeft: 6 }}>unconfirmed</span>}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 6 }}>Releases</div>
        {g.market.events.filter((e) => e.status === 'done').slice(-8).reverse().map((e) => (
          <div key={e.id} style={{ fontSize: 12.5, marginBottom: 6 }}><span className="tag" style={{ marginRight: 6 }}>{EVENT_INFO[e.kind].short}</span>{e.outcome}</div>
        ))}
      </div>
    </>
  );
}
