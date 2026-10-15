import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { fpct } from '../../engine/format';
import { CMDTYS, PAIRS, PIP, parSwapRate, parYield, STOCKS } from '../../engine/market';
import { cmdtyFwd, eqVol, futPrice, fxForward } from '../../engine/pricing';
import type { MarketState } from '../../engine/types';
import { LineChart, Sparkline } from '../components/charts';
import { LearnLink } from '../components/Learn';
import { Screen, useContentWidth } from '../components/Screen';
import { Card, Pill, Row, Section, Segmented, T } from '../components/ui';
import { useGame } from '../GameContext';
import { spotLabel } from '../labels';
import { clockLabel } from '../../game/live';
import { marketAt } from '../../engine/intraday';
import { C, S, signColor } from '../theme';
import { regimeColor } from './Desk';

type Seg = 'rates' | 'eq' | 'fx' | 'credit' | 'cmdty';
const CURVE_T = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];

function Cell({ v, w = 70, color, bold }: { v: string; w?: number; color?: string; bold?: boolean }) {
  return (
    <T v="num" color={color} style={{ width: w, textAlign: 'right', fontSize: 12.5, fontWeight: bold ? '700' : '500' }}>{v}</T>
  );
}

function Head({ cols }: { cols: [string, number][] }) {
  return (
    <Row gap={0} style={{ paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
      {cols.map(([c, w], i) => (
        <T key={c} v="caption" style={i === 0 ? { flex: 1 } : { width: w, textAlign: 'right' }}>{c}</T>
      ))}
    </Row>
  );
}

const chg = (a: number, b: number | undefined) => (b ? a / b - 1 : 0);
const sgnPct = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const sgnBp = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

export function MarketsScreen() {
  const g = useGame();
  const s = g.s!;
  const m = s.market;
  const p = s.openMarket ?? s.prevMarket;
  const w = useContentWidth() - 32;
  const [seg, setSeg] = useState<Seg>('rates');
  return (
    <Screen title="Markets" subtitle={`${s.date} · ${clockLabel(s.clock)} · changes since the open`} right={<Pill text={m.regime} color={regimeColor(m.regime)} filled />}>
      <View style={{ marginTop: S.md }}>
        <Segmented
          value={seg}
          options={[
            { id: 'rates', label: 'Rates' },
            { id: 'eq', label: 'Equity' },
            { id: 'fx', label: 'FX' },
            { id: 'credit', label: 'Credit' },
            { id: 'cmdty', label: 'Cmdty' },
          ]}
          onChange={setSeg}
        />
      </View>
      <Intraday w={w + 32} />
      {seg === 'rates' ? <Rates m={m} p={p} w={w} /> : null}
      {seg === 'eq' ? <Equity m={m} p={p} w={w} /> : null}
      {seg === 'fx' ? <Fx m={m} p={p} /> : null}
      {seg === 'credit' ? <Credit m={m} p={p} /> : null}
      {seg === 'cmdty' ? <Cmdty m={m} p={p} w={w} /> : null}
    </Screen>
  );
}

/** Today's intraday path of four bellwethers, sampled every 10 market minutes. */
function Intraday({ w }: { w: number }) {
  const g = useGame();
  const s = g.s!;
  const bucket = Math.floor(s.clock / 5);
  const series = useMemo(() => {
    const pts: { idx: number; y10: number; eur: number; wti: number }[] = [];
    for (let t = 0; t <= s.clock; t += 10) {
      const mk = t === s.clock ? s.market : marketAt(s, t);
      pts.push({ idx: mk.eq.spot.US500, y10: parYield(mk, 10) * 100, eur: mk.fx.spot.EURUSD, wti: mk.cmdty.spot.WTI });
    }
    pts.push({ idx: s.market.eq.spot.US500, y10: parYield(s.market, 10) * 100, eur: s.market.fx.spot.EURUSD, wti: s.market.cmdty.spot.WTI });
    return pts;
  }, [s.day, bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const cw = (w - 8) / 2 - 24;
  const tiles: [string, number[], (x: number) => string, boolean][] = [
    ['US500', series.map((x) => x.idx), (x) => x.toFixed(1), false],
    ['UST 10Y %', series.map((x) => x.y10), (x) => x.toFixed(3), true],
    ['EURUSD', series.map((x) => x.eur), (x) => x.toFixed(4), false],
    ['WTI', series.map((x) => x.wti), (x) => x.toFixed(2), false],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: S.md }}>
      {tiles.map(([label, d, f, inv]) => {
        const chgv = d[d.length - 1] - d[0];
        const col = Math.abs(chgv) < 1e-12 ? C.textDim : (inv ? -chgv : chgv) > 0 ? C.up : C.down;
        return (
          <Card key={label} style={{ width: (w - 8) / 2 - 16, padding: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption">{label}</T>
              <T v="caption" color={col}>{label.includes('%') ? `${chgv >= 0 ? '+' : ''}${(chgv * 100).toFixed(1)}bp` : `${chgv >= 0 ? '+' : ''}${((chgv / d[0]) * 100).toFixed(2)}%`}</T>
            </Row>
            <T v="num" style={{ marginTop: 2 }}>{f(d[d.length - 1])}</T>
            <View style={{ marginTop: 4 }}>
              <Sparkline data={d.length > 1 ? d : [d[0], d[0]]} width={cw} height={30} color={col} baseline={d[0]} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

function Rates({ m, p, w }: { m: MarketState; p?: MarketState; w: number }) {
  const g = useGame();
  const s = g.s!;
  const series = [
    { label: 'UST par yield', color: C.accent, pts: CURVE_T.map((t) => ({ x: t, y: parYield(m, t) * 100 })) },
    { label: 'SOFR swap', color: C.info, pts: CURVE_T.map((t) => ({ x: t, y: parSwapRate(m, t) * 100 })) },
  ];
  if (p) series.push({ label: 'UST at open', color: C.textFaint, pts: CURVE_T.map((t) => ({ x: t, y: parYield(p, t) * 100 })), dashed: true } as any);
  const sr3 = Object.values(s.instruments).filter((i) => i.kind === 'sofrFut' && i.start > m.t).sort((a: any, b: any) => a.start - b.start).slice(0, 6);
  const hist = s.history.map((h) => h.ust10 * 100);
  return (
    <View>
      <Section title="Curves">
        <Card>
          <LineChart series={series} width={w} xTicks={[0.25, 5, 10, 20, 30]} xFmt={(x) => (x < 1 ? `${Math.round(x * 12)}M` : `${x}Y`)} yFmt={(y) => `${y.toFixed(2)}%`} />
          <Row gap={16} style={{ marginTop: 10 }}>
            <T v="caption">SOFR {fpct(m.rates.sofr, 2)}</T>
            <T v="caption">2s10s {((parYield(m, 10) - parYield(m, 2)) * 1e4).toFixed(0)}bp</T>
            <T v="caption">Repo +{m.rates.repoSpread.toFixed(0)}bp</T>
          </Row>
          <LearnLink topic="dv01" />
        </Card>
      </Section>
      <Section title="Benchmarks">
        <Card>
          <Head cols={[['Tenor', 0], ['UST', 62], ['Δ bp', 52], ['Swap', 62], ['Spread', 58]]} />
          {[2, 5, 10, 30].map((t) => {
            const y = parYield(m, t);
            const sw = parSwapRate(m, t);
            return (
              <Row key={t} gap={0} style={{ paddingVertical: 6 }}>
                <T v="small" color={C.text} style={{ flex: 1 }}>{t}Y</T>
                <Cell v={`${(y * 100).toFixed(3)}`} w={62} />
                <Cell v={p ? sgnBp((y - parYield(p, t)) * 1e4) : '—'} w={52} color={p ? signColor(-(y - parYield(p, t))) : undefined} />
                <Cell v={`${(sw * 100).toFixed(3)}`} w={62} />
                <Cell v={`${((sw - y) * 1e4).toFixed(1)}`} w={58} />
              </Row>
            );
          })}
          <T v="caption" style={{ marginTop: 6 }}>Swap spread = SOFR swap rate − Treasury yield; it can turn negative when dealers' balance sheets are constrained.</T>
        </Card>
      </Section>
      <Section title="SOFR futures strip">
        <Card>
          {sr3.map((f) => {
            const px = futPrice(f, m);
            return (
              <Row key={f.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                <T v="small" color={C.text}>{f.id}</T>
                <T v="num" style={{ fontSize: 12.5 }}>{px.toFixed(3)} → {(100 - px).toFixed(2)}%</T>
              </Row>
            );
          })}
          <T v="caption" style={{ marginTop: 4 }}>Price = 100 − expected 3M SOFR: the market's path for Fed policy.</T>
        </Card>
      </Section>
      {hist.length > 1 ? (
        <Section title="10Y yield history">
          <Card>
            <Sparkline data={hist} width={w} height={60} />
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

function Equity({ m, p, w }: { m: MarketState; p?: MarketState; w: number }) {
  const g = useGame();
  const s = g.s!;
  const S0 = m.eq.spot.US500;
  const ks = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];
  const smile = [
    { label: '1M', color: C.accent, pts: ks.map((k) => ({ x: k * 100, y: eqVol(m, 'US500', S0 * k, 1 / 12) * 100 })) },
    { label: '3M', color: C.info, pts: ks.map((k) => ({ x: k * 100, y: eqVol(m, 'US500', S0 * k, 0.25) * 100 })) },
  ];
  const hist = s.history.map((h) => h.us500);
  return (
    <View>
      <Section title="US500 index">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="numXl">{S0.toFixed(1)}</T>
            <T v="num" color={signColor(chg(S0, p?.eq.spot.US500))}>{sgnPct(chg(S0, p?.eq.spot.US500))}</T>
          </Row>
          <Row gap={16} style={{ marginTop: 4 }}>
            <T v="caption">ATM vol {(m.eq.atmVol.US500 * 100).toFixed(1)}</T>
            <T v="caption">Div yield {fpct(m.eq.div.US500 ?? 0, 1)}</T>
            <T v="caption">ETF prem {(m.eq.etfPrem * 1e4).toFixed(1)}bp</T>
          </Row>
          {hist.length > 1 ? <View style={{ marginTop: 10 }}><Sparkline data={hist} width={w} height={50} /></View> : null}
        </Card>
      </Section>
      <Section title="Volatility smile">
        <Card>
          <LineChart series={smile} width={w} xFmt={(x) => `${x.toFixed(0)}%`} yFmt={(y) => y.toFixed(1)} xTicks={[80, 90, 100, 110]} />
          <T v="caption" style={{ marginTop: 6 }}>Implied vol by strike (% of spot). Downside puts are dearer: skew steepens in stress.</T>
          <LearnLink topic="options" />
        </Card>
      </Section>
      <Section title="Single stocks">
        <Card>
          <Head cols={[['Stock', 0], ['Price', 70], ['Chg', 62], ['Beta', 44]]} />
          {STOCKS.map((st) => {
            const px = m.eq.spot[st.id];
            const c = chg(px, p?.eq.spot[st.id]);
            return (
              <Row key={st.id} gap={0} style={{ paddingVertical: 5 }}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={C.text}>{st.id}</T>
                  <T v="caption" numberOfLines={1}>{st.name}</T>
                </View>
                <Cell v={px.toFixed(2)} />
                <Cell v={sgnPct(c)} w={62} color={signColor(c)} />
                <Cell v={st.beta.toFixed(2)} w={44} />
              </Row>
            );
          })}
        </Card>
      </Section>
    </View>
  );
}

function Fx({ m, p }: { m: MarketState; p?: MarketState }) {
  return (
    <View>
      <Section title="Spot and forwards">
        <Card>
          <Head cols={[['Pair', 0], ['Spot', 72], ['Chg', 58], ['3M pts', 58], ['Vol', 40]]} />
          {PAIRS.map((pair) => {
            const x = m.fx.spot[pair];
            const c = chg(x, p?.fx.spot[pair]);
            const fwd = fxForward(m, pair, 0.25);
            const pts = (fwd - x) / PIP[pair];
            return (
              <Row key={pair} gap={0} style={{ paddingVertical: 6 }}>
                <T v="small" color={C.text} style={{ flex: 1 }}>{pair}</T>
                <Cell v={spotLabel(pair, x)} w={72} />
                <Cell v={sgnPct(c)} w={58} color={signColor(c)} />
                <Cell v={pts.toFixed(0)} w={58} />
                <Cell v={(m.fx.vol[pair] * 100).toFixed(1)} w={40} />
              </Row>
            );
          })}
          <T v="caption" style={{ marginTop: 6 }}>Forward points come from the interest-rate differential (covered interest parity): high-yielders trade at a forward discount.</T>
          <LearnLink topic="fx" />
        </Card>
      </Section>
      <Section title="Short rates">
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Object.entries(m.rates.ccy).map(([c, r]) => (
              <View key={c} style={{ width: '25%', paddingVertical: 5 }}>
                <T v="caption">{c}</T>
                <T v="num" style={{ fontSize: 13 }}>{fpct(r, 2)}</T>
              </View>
            ))}
          </View>
          <T v="caption" style={{ marginTop: 4 }}>Carry: holding a currency earns its short rate. Long BRL vs USD earns ~{fpct(m.rates.ccy.BRL - m.rates.ccy.USD, 1)} a year — until it doesn't.</T>
        </Card>
      </Section>
    </View>
  );
}

function Credit({ m, p }: { m: MarketState; p?: MarketState }) {
  const g = useGame();
  const s = g.s!;
  const rows = Object.values(s.issuers);
  return (
    <View>
      <Section title="Indices">
        <Card>
          {(['CDXIG', 'CDXHY'] as const).map((k) => {
            const d = m.credit.spread[k] - (p?.credit.spread[k] ?? m.credit.spread[k]);
            return (
              <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
                <T v="small" color={C.text}>{k === 'CDXIG' ? 'CDX IG 5Y' : 'CDX HY 5Y'}</T>
                <T v="num">{m.credit.spread[k].toFixed(1)}bp <T v="num" color={signColor(-d)} style={{ fontSize: 12 }}>{sgnBp(d)}</T></T>
              </Row>
            );
          })}
          <T v="caption" style={{ marginTop: 4 }}>CDS-bond basis {m.credit.basis.toFixed(0)}bp</T>
          {!s.desks.credit.unlocked ? <T v="caption" color={C.warn} style={{ marginTop: 4 }}>Credit trading launches around day 6.</T> : null}
          <LearnLink topic="credit" />
        </Card>
      </Section>
      <Section title="Issuers (5Y spread)">
        <Card>
          <Head cols={[['Issuer', 0], ['Rating', 50], ['Spread', 62], ['Δ', 50]]} />
          {rows.map((is) => {
            const sp = m.credit.spread[is.id];
            const d = sp - (p?.credit.spread[is.id] ?? sp);
            const dflt = m.credit.defaulted[is.id];
            return (
              <Row key={is.id} gap={0} style={{ paddingVertical: 5 }}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={dflt ? C.down : C.text} numberOfLines={1}>{is.name}</T>
                  <T v="caption">{is.sector}</T>
                </View>
                <Cell v={is.rating} w={50} />
                <Cell v={dflt ? 'DEFAULT' : sp.toFixed(0)} w={62} color={dflt ? C.down : undefined} />
                <Cell v={dflt ? '' : sgnBp(d, 0)} w={50} color={signColor(-d)} />
              </Row>
            );
          })}
        </Card>
      </Section>
    </View>
  );
}

function Cmdty({ m, p, w }: { m: MarketState; p?: MarketState; w: number }) {
  const g = useGame();
  const s = g.s!;
  const [sel, setSel] = useState('WTI');
  const ts = [0, 1, 2, 3, 4, 5, 6, 9, 12].map((x) => x / 12);
  const curve = [{ label: CMDTYS[sel].name, color: C.accent, pts: ts.map((t) => ({ x: t * 12, y: cmdtyFwd(m, sel, t) })) }];
  if (p) curve.push({ label: 'At open', color: C.textFaint, pts: ts.map((t) => ({ x: t * 12, y: cmdtyFwd(p, sel, t) })), dashed: true } as any);
  return (
    <View>
      <Section title="Spot">
        <Card>
          <Head cols={[['Commodity', 0], ['Price', 74], ['Chg', 60], ['Curve', 72]]} />
          {Object.keys(CMDTYS).map((c) => {
            const x = m.cmdty.spot[c];
            const ch = chg(x, p?.cmdty.spot[c]);
            const carry = m.cmdty.carry[c];
            return (
              <Row key={c} gap={0} style={{ paddingVertical: 5 }}>
                <Pressable style={{ flex: 1 }} onPress={() => setSel(c)}>
                  <T v="small" color={c === sel ? C.accent : C.text}>{CMDTYS[c].name}</T>
                  <T v="caption">{CMDTYS[c].unit}</T>
                </Pressable>
                <Cell v={x.toFixed(x > 100 ? 1 : 2)} w={74} />
                <Cell v={sgnPct(ch)} w={60} color={signColor(ch)} />
                <Cell v={carry < 0 ? 'backw.' : 'contango'} w={72} color={carry < 0 ? C.warn : C.textDim} />
              </Row>
            );
          })}
          {!s.desks.cmdty.unlocked ? <T v="caption" color={C.warn} style={{ marginTop: 4 }}>Commodities trading launches around day 13.</T> : null}
        </Card>
      </Section>
      <Section title="Futures curve">
        <Card>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.keys(CMDTYS).map((c) => (
              <Pressable key={c} onPress={() => setSel(c)} hitSlop={4}>
                <Pill text={c} color={c === sel ? C.accent : C.textFaint} filled={c === sel} />
              </Pressable>
            ))}
          </Row>
          <LineChart series={curve} width={w} xFmt={(x) => `${x.toFixed(0)}M`} yFmt={(y) => y.toFixed(y > 100 ? 0 : 2)} xTicks={[0, 3, 6, 9, 12]} />
          <T v="caption" style={{ marginTop: 6 }}>{m.cmdty.carry[sel] < 0 ? 'Backwardation: prompt supply is tight; longs roll up the curve and earn roll yield.' : 'Contango: futures above spot pay for storage and financing; longs lose roll yield.'} Natural gas and corn also carry seasonal humps.</T>
          <LearnLink topic="commodities" />
        </Card>
      </Section>
    </View>
  );
}

