import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accountValue } from '../../engine/accounts';
import { deskSummary } from '../../engine/analytics';
import { fm, fpct } from '../../engine/format';
import { liquidityMetrics } from '../../engine/funding';
import { computeMargin, marginCalc } from '../../engine/margin';
import { clientEconomics, deskScenario, effectivePD } from '../../engine/risk';
import { Screen } from '../components/Screen';
import { Bar, Btn, Card, KV, Metric, Pill, Row, Section, Stepper, T, useExplain } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S } from '../theme';

export function RiskScreen() {
  const g = useGame();
  const s = g.s!;
  const nav = useNav();
  const { open } = useExplain();
  const d = useMemo(() => deskSummary(s), [g.v]);
  const scen = useMemo(() => deskScenario(s), [g.v]);
  const lm = useMemo(() => liquidityMetrics(s), [g.v]);
  const [openScen, setOpenScen] = useState<string | null>(null);
  const [shock, setShock] = useState(s.desk.houseMarketShock);
  const [conc, setConc] = useState(s.desk.concAddonRate);
  const [msg, setMsg] = useState<string | null>(null);
  const active = Object.values(s.clients).filter((c) => c.status === 'active');
  const worst = scen.reduce((a, b) => (b.shortfall > a.shortfall ? b : a), scen[0]);

  // crowded names across the book
  const crowd: Record<string, { l: number; s: number; n: Set<string> }> = {};
  for (const c of active)
    for (const id in c.positions) {
      const sec = s.securities[id];
      if (sec.kind === 'future') continue;
      const v = c.positions[id] * sec.price;
      crowd[id] ??= { l: 0, s: 0, n: new Set() };
      if (v > 0) crowd[id].l += v;
      else crowd[id].s -= v;
      crowd[id].n.add(c.short);
    }
  const crowded = Object.entries(crowd)
    .filter(([, x]) => x.n.size >= 2)
    .sort((a, b) => b[1].l + b[1].s - (a[1].l + a[1].s))
    .slice(0, 6);

  return (
    <Screen title="Risk" subtitle="Margin, counterparty exposure, stress and liquidity">
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Stress exposure" value={fm(d.stressExposure)} tone={d.stressExposure > 0 ? C.down : C.up} sub="Σ worst-case shortfalls" />
        <Metric label="Expected loss" value={fm(d.expectedLoss)} sub="annual, PD × LGD × exposure" />
      </Row>

      <Section title="Margin status">
        <View style={{ gap: 8 }}>
          {active.map((c) => {
            const m = computeMargin(s, c);
            const av = accountValue(s, c);
            const ratio = m.initial > 0 ? av.equity / m.initial : 9;
            return (
              <Card key={c.id} style={{ padding: S.md }} onPress={() => open(marginCalc(s, c))}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={6}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                    <T v="h3">{c.short}</T>
                    {c.marginCall?.status === 'open' ? <Pill text={`Call ${fm(c.marginCall.amount)} due D${c.marginCall.dueDay}`} color={C.down} filled /> : null}
                  </Row>
                  <T v="num" color={av.equity < m.maintenance ? C.down : av.equity < m.initial ? C.warn : C.up}>{(ratio * 100).toFixed(0)}% of IM</T>
                </Row>
                <View style={{ marginTop: 8 }}>
                  <Bar value={Math.max(0, av.equity)} max={Math.max(av.equity, m.initial) * 1.2} marker={m.maintenance} color={av.equity < m.maintenance ? C.down : av.equity < m.initial ? C.warn : C.up} />
                </View>
                <T v="caption" style={{ marginTop: 5 }}>Equity {fm(av.equity)} · IM {fm(m.initial)} · MM {fm(m.maintenance)} · conc {fm(m.concentration)} · liq {fm(m.liquidity)}</T>
              </Card>
            );
          })}
        </View>
      </Section>

      <Section title="Counterparty exposure">
        <Card>
          {active
            .map((c) => ({ c, e: clientEconomics(s, c) }))
            .sort((a, b) => b.e.exposure - a.e.exposure)
            .map(({ c, e }) => (
              <KV key={c.id} k={`${c.short} · ${c.profile.rating} · PD ${fpct(effectivePD(s, c), 1)}`} v={fm(e.exposure)} tone={e.exposure > 0 ? C.down : C.textDim} sub={`EL ${fm(e.expectedLoss)} · capital ${fm(e.capital)}`} onPress={() => nav.push({ name: 'client', id: c.id })} />
            ))}
        </Card>
      </Section>

      <Section title="Desk stress scenarios" right={<T v="caption">worst: {worst?.name.split(' (')[0]}</T>}>
        <View style={{ gap: 8 }}>
          {scen.map((sc) => (
            <Card key={sc.id} style={{ padding: S.md }}>
              <Pressable onPress={() => setOpenScen(openScen === sc.id ? null : sc.id)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={6} style={{ flex: 1 }}>
                    <Ionicons name={openScen === sc.id ? 'chevron-down' : 'chevron-forward'} size={13} color={C.textDim} />
                    <T v="small" color={C.text} style={{ flex: 1 }}>{sc.name}</T>
                  </Row>
                  <T v="num" color={sc.shortfall > 0 ? C.down : C.up}>{sc.shortfall > 0 ? `−${fm(sc.shortfall)}` : 'covered'}</T>
                </Row>
                <T v="caption" style={{ marginLeft: 19 }}>Clients lose {fm(-sc.pnl)}; Atlas loses what exceeds their equity after liquidation costs.</T>
              </Pressable>
              {openScen === sc.id
                ? sc.byClient.map((b) => (
                    <Row key={b.clientId} style={{ justifyContent: 'space-between', marginTop: 6, marginLeft: 19 }}>
                      <T v="caption" style={{ flex: 1 }}>{s.clients[b.clientId].short}: P&L {fm(b.pnl)} on equity {fm(b.equity)}</T>
                      <T v="caption" color={b.shortfall > 0 ? C.down : C.textDim}>{b.shortfall > 0 ? `−${fm(b.shortfall)}` : '—'}</T>
                    </Row>
                  ))
                : null}
            </Card>
          ))}
        </View>
      </Section>

      {crowded.length ? (
        <Section title="Crowding across clients">
          <Card>
            {crowded.map(([id, x]) => (
              <KV key={id} k={`${id} · ${[...x.n].join(', ')}`} v={`${fm(x.l)} L / ${fm(x.s)} S`} sub={`crowding score ${fpct(s.securities[id].crowding, 0)}${x.l > 0 && x.s > 0 ? ' · partly internalisable' : ''}`} onPress={() => nav.push({ name: 'security', id })} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Liquidity">
        <Card onPress={() => open(lm.lines)}>
          <KV k="Stressed 30-day outflows" v={fm(lm.stressedOutflows)} />
          <KV k="Liquidity sources" v={fm(lm.sources)} />
          <KV k="Coverage" v={`${lm.lcr.toFixed(2)}×`} tone={lm.lcr < 1 ? C.down : C.up} />
        </Card>
      </Section>

      <Section title="House margin model (desk-wide)">
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={C.text}>Market shock</T>
              <T v="caption">Applied to beta-weighted net exposure, scaled by volatility.</T>
            </View>
            <Stepper value={shock} min={0.06} max={0.3} step={0.01} format={(v) => fpct(v, 0)} onChange={setShock} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={C.text}>Concentration add-on</T>
              <T v="caption">Charged on single-name excess above each client's threshold.</T>
            </View>
            <Stepper value={conc} min={0.05} max={0.5} step={0.05} format={(v) => fpct(v, 0)} onChange={setConc} />
          </Row>
          <Btn title="Apply to all clients" disabled={shock === s.desk.houseMarketShock && conc === s.desk.concAddonRate} onPress={() => setMsg(g.deskMargin({ houseMarketShock: shock, concAddonRate: conc }))} />
          {Object.keys(s.desk.nameAddons).length ? (
            <View>
              <T v="label" style={{ marginBottom: 4 }}>Name-specific short add-ons</T>
              {Object.entries(s.desk.nameAddons).map(([id, v]) => (
                <Row key={id} style={{ justifyContent: 'space-between' }}>
                  <T v="small">{id}: +{fpct(v, 0)} of short MV</T>
                  <Btn small tone="ghost" title="Remove" onPress={() => setMsg(g.removeAddon(id))} />
                </Row>
              ))}
            </View>
          ) : null}
          {msg ? <T v="small" color={C.accent}>{msg}</T> : null}
          <T v="caption">Tightening is not subject to client lock-ups here — it changes the model for everyone — but clients compare your margin with competitors' every day.</T>
        </Card>
      </Section>
    </Screen>
  );
}
