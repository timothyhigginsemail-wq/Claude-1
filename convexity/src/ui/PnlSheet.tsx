import { GameState } from '../engine/game';
import { PnlBuckets, bookValue, bucketTotal } from '../engine/book';
import { clockLabel } from '../engine/market';
import { store } from './store';
import { LearnLink, Sheet, kfmt, pnlCls, sgnUsd } from './common';
import { Bars, COLORS, LineChart, SignedBars } from './charts';

export function attributionItems(b: PnlBuckets) {
  return [
    { label: 'Client edge', value: b.edge, topic: 'pnlexplain' },
    { label: 'Hedge costs', value: b.costs, topic: 'hedgecost' },
    { label: 'Delta', value: b.delta, topic: 'delta' },
    { label: 'Gamma', value: b.gamma, topic: 'gamma' },
    { label: 'Vega', value: b.vega, topic: 'vega' },
    { label: 'Theta', value: b.theta, topic: 'theta' },
    { label: 'Rates', value: b.rates, topic: 'swap' },
    { label: 'Correlation', value: b.corr, topic: 'correlation' },
    { label: 'Carry', value: b.carry, topic: 'funding' },
    { label: 'Unexplained', value: b.cross, topic: 'pnlexplain' },
  ];
}

export function PnlSheet({ g }: { g: GameState }) {
  const b = g.book.today;
  const total = bucketTotal(b);
  const intra = g.book.intradayPnl.map((y, i) => [i, y] as [number, number]);
  const daily = g.book.dailyPnl.map((d) => d.pnl);
  let cum = 0;
  const cumSeries = g.book.dailyPnl.map((d) => [d.day + 1, (cum += d.pnl)] as [number, number]);
  return (
    <Sheet title="P&L" sub="Live attribution. Every dollar has a reason." right={<LearnLink topic="pnlexplain" label="P&L explain" />}>
      <div className="card">
        <div className="micro">Today</div>
        <div className={`hero-num ${pnlCls(total)}`} style={{ margin: '4px 0 8px' }}>{sgnUsd(total)}</div>
        <LineChart height={130} zeroLine series={[{ data: intra, color: total >= 0 ? COLORS.up : COLORS.down, fill: true }]} xFmt={(x) => clockLabel(Math.max(0, Math.round(x) - 1))} yFmt={kfmt} />
      </div>
      <div className="card">
        <div className="micro" style={{ marginBottom: 8 }}>Attribution today (tap for the concept)</div>
        <SignedBars items={attributionItems(b).map((i) => ({ ...i, onClick: () => store.learn(i.topic) }))} fmt={(x) => sgnUsd(x)} />
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          The Greek buckets use each position's Greeks from just before every 5-minute move. "Unexplained" is what they missed: jumps, barrier events, the smile moving, higher-order terms and MC noise.
        </div>
      </div>
      {daily.length > 0 && (
        <div className="card">
          <div className="card-title"><span className="micro">Daily P&L</span><span className="mono" style={{ fontSize: 12 }}>Total {sgnUsd(bookValue(g.book))}</span></div>
          <Bars data={daily} fmt={kfmt} labels={g.book.dailyPnl.map((d) => `D${d.day + 1}`)} />
          {cumSeries.length > 1 && <LineChart height={110} zeroLine series={[{ data: cumSeries, color: COLORS.acc }]} xFmt={(x) => `D${x.toFixed(0)}`} yFmt={kfmt} />}
        </div>
      )}
      <div className="card">
        <div className="micro" style={{ marginBottom: 8 }}>Life to date</div>
        <SignedBars items={attributionItems(g.book.life).filter((i) => !['Delta', 'Gamma', 'Vega', 'Theta', 'Rates', 'Correlation', 'Unexplained'].includes(i.label)).concat([{ label: 'Market', value: g.book.life.market, topic: 'pnlexplain' }])} fmt={(x) => sgnUsd(x)} />
      </div>
    </Sheet>
  );
}
