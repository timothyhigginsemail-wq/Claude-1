import { useState } from 'react';
import { GameState, refreshStress, utilisation, view } from '../engine/game';
import { ASSETS, EQUITIES, SPECS } from '../engine/market';
import { GRID_SPOT, GRID_VOL, STRESSES, applyStress } from '../engine/risk';
import { isMC, unitPV } from '../engine/pricing';
import { store } from './store';
import { LearnLink, Meter, Sheet, kfmt, pnlCls, sgnUsd, usd } from './common';
import { COLORS, Heatmap, Histogram, LineChart } from './charts';

export function RiskSheet({ g }: { g: GameState }) {
  return (
    <Sheet title="Risk" sub="Live sensitivities, limits, VaR and stress" right={<LearnLink topic="var" label="VaR & stress" />}>
      <RiskPanel g={g} />
      <GridCard g={g} />
    </Sheet>
  );
}

export function RiskPanel({ g, compact }: { g: GameState; compact?: boolean }) {
  const R = g.book.risk;
  const u = utilisation(g);
  const eqG = EQUITIES.slice().sort((a, b) => Math.abs(R.gamma[b]) - Math.abs(R.gamma[a]))[0];
  const be = Math.abs(R.gamma[eqG]) > 1000 && Math.abs(R.theta) > 10 ? Math.sqrt(Math.abs((2 * R.theta) / R.gamma[eqG])) : null;
  return (
    <>
      <div className="card">
        <div className="card-title"><span className="micro">Limits</span>{compact && <button className="pill" style={{ height: 24, fontSize: 11 }} onClick={() => store.open('risk')}>Full risk</button>}</div>
        <div className="col" style={{ gap: 8 }}>
          {u.filter((x) => x.key !== 'delta' || Math.abs(x.value) > 1000 || x.asset === 'ORX').map((x) => (
            <div key={x.label} className="limitrow">
              <span className="muted">{x.label}</span>
              <Meter value={x.util} />
              <span className={`mono ${x.util > 1 ? 'down' : x.util > 0.8 ? 'warn' : ''}`} style={{ textAlign: 'right' }}>{(x.util * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
        {g.breaches.length > 0 && <div className="down" style={{ fontSize: 12.5, marginTop: 8 }}>⚠ {g.breaches.length} active breach{g.breaches.length > 1 ? 'es' : ''}. Risk will act at the deadline.</div>}
      </div>
      <div className="card">
        <div className="card-title"><span className="micro">Greeks ($)</span><LearnLink topic="delta" label="Greeks" /></div>
        <div className="scrollx">
          <table className="t">
            <thead><tr><th></th><th>Δ /1%</th><th>Γ /1%</th><th>vega/pt</th><th>vanna</th><th>volga</th></tr></thead>
            <tbody>
              {ASSETS.map((a) => (
                <tr key={a}>
                  <td>{SPECS[a].name}</td>
                  <td>{kfmt(R.delta[a])}</td>
                  <td className={R.gamma[a] < -500 ? 'down' : R.gamma[a] > 500 ? 'up' : ''}>{kfmt(R.gamma[a])}</td>
                  <td>{kfmt(R.vega[a])}</td>
                  <td>{kfmt(R.vanna[a])}</td>
                  <td>{kfmt(R.volga[a])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid3" style={{ marginTop: 10 }}>
          <div className="stat"><div className="micro">theta / day</div><div className={`v ${pnlCls(R.theta)}`}>{kfmt(R.theta)}</div></div>
          <div className="stat"><div className="micro">DV01</div><div className="v">{kfmt(R.dv01)}</div></div>
          <div className="stat"><div className="micro">corr / pt</div><div className="v">{kfmt(R.corr01)}</div></div>
        </div>
        {be !== null && (
          <div className="note-card" style={{ marginTop: 10 }}>
            <i style={{ background: R.gamma[eqG] < 0 ? COLORS.down : COLORS.up }} />
            <span>
              {SPECS[eqG].name} gamma–theta break-even: <b className="mono">{be.toFixed(2)}%</b> a day. {R.gamma[eqG] < 0 ? 'Moves bigger than this cost you more than theta pays.' : 'You need moves bigger than this to pay for the decay.'} <LearnLink topic="theta" />
            </span>
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-title"><span className="micro">1-day VaR / ES</span><span className="mono" style={{ fontSize: 12 }}>VaR {usd(g.varRes.var99)} · ES {usd(g.varRes.es975)}</span></div>
        {g.varRes.hist.length > 0 && <Histogram bins={g.varRes.hist} lo={g.varRes.lo} hi={g.varRes.hi} fmt={kfmt} marks={[{ x: -g.varRes.var99, label: 'VaR99', color: COLORS.warn }, { x: -g.varRes.es975, label: 'ES97.5', color: COLORS.down }]} />}
        <div className="muted" style={{ fontSize: 11.5 }}>Delta-gamma-vega approximation over 2,000 fat-tailed scenarios. It misses barrier jumps and regime breaks. That is what the stress tests are for.</div>
      </div>
      <div className="card">
        <div className="card-title">
          <span className="micro">Stress tests (full revaluation)</span>
          <button className="pill" style={{ height: 24, fontSize: 11 }} onClick={() => store.act((g) => refreshStress(g))}>Rerun</button>
        </div>
        <div className="col" style={{ gap: 6 }}>
          {g.stress.map((s) => {
            const def = STRESSES.find((x) => x.id === s.id)!;
            return (
              <div key={s.id} className="between" style={{ fontSize: 13 }}>
                <div>
                  <div>{s.label}</div>
                  {!compact && <div className="muted" style={{ fontSize: 11 }}>{def.note}</div>}
                </div>
                <span className={`mono ${pnlCls(s.pnl)}`}>{sgnUsd(s.pnl)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function GridCard({ g }: { g: GameState }) {
  const [grid, setGrid] = useState<{ vals: number[][]; prof: [number, number][]; prof5: [number, number][]; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const v = view(g);
      const base = g.book.positions.map((p) => (isMC(p.inst) ? unitPV(p.inst, v, 1024) : p.unitPv));
      const pnlAt = (eq: number, vol: number) => {
        const sv = applyStress(v, { id: 'g', label: '', note: '', eq, fx: 0, vol, corr: 0, rates: 0 });
        return g.book.positions.reduce((a, p, i) => a + p.qty * (unitPV(p.inst, sv, isMC(p.inst) ? 1024 : undefined) - base[i]), 0);
      };
      const vals = GRID_VOL.map((dv) => GRID_SPOT.map((ds) => pnlAt(ds, dv)));
      const xs = [-0.25, -0.2, -0.15, -0.1, -0.07, -0.05, -0.03, -0.015, 0, 0.015, 0.03, 0.05, 0.07, 0.1, 0.15];
      const prof = xs.map((x) => [x * 100, pnlAt(x, 0)] as [number, number]);
      const prof5 = xs.map((x) => [x * 100, pnlAt(x, Math.max(0, -x * 100))] as [number, number]);
      setGrid({ vals, prof, prof5, at: g.market.t });
      setBusy(false);
    }, 20);
  };
  return (
    <div className="card">
      <div className="card-title">
        <span className="micro">Spot × vol grid · book profile</span>
        <button className="pill acc" style={{ height: 26, fontSize: 11.5 }} onClick={run} disabled={busy}>{busy ? 'Revaluing…' : grid ? 'Recompute' : 'Run'}</button>
      </div>
      {!grid && <div className="muted" style={{ fontSize: 12.5 }}>Revalues every position under combined equity and vol shocks. This is the shape your Greeks only approximate.</div>}
      {grid && (
        <>
          <Heatmap rows={GRID_VOL.map((x) => `${x >= 0 ? '+' : ''}${x}v`)} cols={GRID_SPOT.map((x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`)} values={grid.vals} fmt={kfmt} rowLabel="vol" colLabel="eq" highlight={[1, 3]} />
          <div className="micro" style={{ margin: '10px 0 4px' }}>Book P&L vs equity move</div>
          <LineChart
            height={160}
            zeroLine
            series={[
              { data: grid.prof, color: COLORS.acc, label: 'Vol unchanged' },
              { data: grid.prof5, color: COLORS.down, dash: '4 3', label: 'Vol rises 1pt per 1% fall' },
            ]}
            xFmt={(x) => `${x.toFixed(0)}%`}
            yFmt={kfmt}
            legend
          />
          {grid.at !== g.market.t && <div className="muted" style={{ fontSize: 11 }}>Computed earlier. Recompute for the current market.</div>}
        </>
      )}
    </div>
  );
}
