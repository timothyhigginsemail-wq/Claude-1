import React, { useState } from 'react';
import { View } from 'react-native';
import { calc } from '../../engine/explain';
import { fm, fmSigned, fpct } from '../../engine/format';
import type { DeskId } from '../../engine/types';
import { explainCapital } from '../../game/explainers';
import { DESK_META } from '../../game/setup';
import { HBars } from '../components/charts';
import { LearnLink } from '../components/Learn';
import { Screen, useContentWidth } from '../components/Screen';
import { Bar, Btn, Card, KV, Metric, Pill, Row, Section, T, useExplain } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { DESKS, useRisk } from '../useRisk';
import { DeskChips } from './Book';

function LimitRow({ label, used, limit, color, onPress }: { label: string; used: number; limit: number; color: string; onPress?: () => void }) {
  const u = used / Math.max(1, limit);
  return (
    <View style={{ paddingVertical: 6 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <T v="small" color={C.text} style={{ flex: 1 }} numberOfLines={1}>{label}</T>
        <T v="num" style={{ fontSize: 12.5 }} color={u > 1 ? C.down : u > 0.8 ? C.warn : undefined}>{fm(used)} / {fm(limit)}</T>
      </Row>
      <Bar value={used} max={Math.max(limit, used) * 1.15} marker={limit} color={u > 1 ? C.down : u > 0.8 ? C.warn : color} />
    </View>
  );
}

export function RiskScreen() {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const risk = useRisk()!;
  const w = useContentWidth() - 32;
  const [desk, setDesk] = useState<DeskId>('eq');
  const [msg, setMsg] = useState<string | null>(null);
  const ex = useExplain();
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked);
  const varLimit = unlocked.reduce((a, d) => a + s.desks[d].limits.var, 0);
  const d = s.desks[desk];
  const sm = risk.sum[desk];
  const dv = risk.v.byDesk[desk];
  const kr = ['2', '5', '10', '30'].map((k) => ({ label: `${k}Y`, value: sm.keyRates[k] ?? 0 }));
  const fxRows = Object.entries(sm.fxExposure).filter(([, v]) => Math.abs(v) > 1e3).map(([k, v]) => ({ label: k, value: v }));
  const cmRows = Object.entries(sm.cmdtyDelta).filter(([, v]) => Math.abs(v) > 100).map(([k, v]) => ({ label: k, value: v }));
  const eqRows = Object.entries(sm.greeks.sens).filter(([k, v]) => k.startsWith('eq:') && Math.abs(v) > 100).map(([k, v]) => ({ label: k.slice(3), value: v }));
  const crRows = Object.entries(sm.greeks.sens).filter(([k, v]) => k.startsWith('cr:') && Math.abs(v) > 10).map(([k, v]) => ({ label: k.slice(3), value: v }));
  const cpty = Object.entries(risk.cpty).filter(([, e]) => e.ead > 1e5).sort((a, b) => b[1].ead - a[1].ead).slice(0, 6);
  return (
    <Screen title="Risk" subtitle={`Firm VaR ${fm(risk.v.var99)} · limit ${fm(varLimit)}`}>
      <Row gap={8} style={{ marginTop: S.md }}>
        <Metric
          label="VaR 99% 1-day"
          value={fm(risk.v.var99)}
          tone={risk.v.var99 > varLimit ? C.down : undefined}
          sub={`${fpct(risk.v.var99 / Math.max(1, varLimit), 0)} of limit`}
          calc={() =>
            calc('Firm VaR (99%, 1-day)', risk.v.var99, {
              formula: 'Loss exceeded on 3 of 300 simulated days',
              children: [...unlocked.map((x) => calc(`${DESK_META[x].name} VaR`, risk.v.byDesk[x].var99)), calc('Diversification benefit', risk.v.var99 - risk.v.undiversified, { note: 'Desks partly offset each other — less so in a crisis.' })],
            })
          }
        />
        <Metric label="Expected shortfall" value={fm(risk.v.es975)} sub="avg loss beyond 97.5%" />
      </Row>
      <Card style={{ marginTop: 8 }}>
        <T v="label" style={{ marginBottom: 4 }}>Limits</T>
        {unlocked.map((x) => (
          <View key={x}>
            <LimitRow label={`${DESK_META[x].name} · VaR`} used={risk.v.byDesk[x].var99} limit={s.desks[x].limits.var} color={DESK_META[x].color} />
            <LimitRow label={`${DESK_META[x].short} · ${risk.sum[x].primaryLabel}`} used={risk.sum[x].primary} limit={s.desks[x].limits.primary} color={DESK_META[x].color} />
          </View>
        ))}
        <T v="caption" style={{ marginTop: 6 }}>A breach at the close is a warning. Two consecutive closes in breach and risk management cuts the desk's positions by half and restricts new client risk for three days. Limits scale with allocated capital (Desk → Management).</T>
        <LearnLink topic="var" />
      </Card>

      <DeskChips value={desk} onChange={setDesk} />
      <Section title={`${d.name} sensitivities`} right={d.restrictedUntil > s.day ? <Pill text={`restricted to D${d.restrictedUntil}`} color={C.down} /> : undefined}>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Equity delta (β, per 1%)', sm.eqDelta],
              ['Gamma (Δdelta per 1%)', sm.gammaTotal],
              ['Vega (per vol pt)', sm.vega],
              ['Theta (per day)', sm.theta],
              ['DV01 (per +1bp)', sm.dv01],
              ['CS01 (per +1bp)', sm.cs01],
              ['FX NOP (per 1%)', sm.fxNOP / 100],
              ['Desk VaR / ES', dv.var99],
            ].map(([l, v]) => (
              <View key={l as string} style={{ width: '50%', paddingVertical: 6 }}>
                <T v="caption">{l}</T>
                <T v="num" color={l === 'Desk VaR / ES' ? undefined : signColor(v as number)}>{l === 'Desk VaR / ES' ? `${fm(dv.var99)} / ${fm(dv.es975)}` : fmSigned(v as number)}</T>
              </View>
            ))}
          </View>
          <T v="caption" style={{ marginTop: 4 }}>Signs show the P&L for the move: a negative DV01 loses if yields rise; positive vega gains if volatility rises.</T>
        </Card>
        {eqRows.length ? (
          <Card style={{ marginTop: 8 }}>
            <T v="label" style={{ marginBottom: 8 }}>Equity delta by underlying ($ per +1%)</T>
            <HBars rows={eqRows} width={w} />
          </Card>
        ) : null}
        {kr.some((x) => Math.abs(x.value) > 10) ? (
          <Card style={{ marginTop: 8 }}>
            <T v="label" style={{ marginBottom: 8 }}>Key-rate DV01 ($ per +1bp)</T>
            <HBars rows={kr} width={w} />
            <T v="caption" style={{ marginTop: 6 }}>Where on the curve the duration sits. A DV01-flat book can still lose on a steepening or flattening.</T>
            <LearnLink topic="dv01" />
          </Card>
        ) : null}
        {crRows.length ? (
          <Card style={{ marginTop: 8 }}>
            <T v="label" style={{ marginBottom: 8 }}>CS01 by name ($ per +1bp)</T>
            <HBars rows={crRows} width={w} />
          </Card>
        ) : null}
        {fxRows.length ? (
          <Card style={{ marginTop: 8 }}>
            <T v="label" style={{ marginBottom: 8 }}>Currency exposure (USD equivalent)</T>
            <HBars rows={fxRows} width={w} />
          </Card>
        ) : null}
        {cmRows.length ? (
          <Card style={{ marginTop: 8 }}>
            <T v="label" style={{ marginBottom: 8 }}>Commodity delta ($ per +1%)</T>
            <HBars rows={cmRows} width={w} />
          </Card>
        ) : null}
        <Btn
          title="Neutralise main risk with liquid hedges"
          icon="shield-checkmark-outline"
          style={{ marginTop: S.md }}
          onPress={() => setMsg(`Hedged ${d.name} with the most liquid instruments: cost ${fm(-g.neutralise(desk))}.`)}
        />
        {msg ? <T v="caption" color={C.text} style={{ marginTop: 6 }}>{msg}</T> : null}
        <T v="caption" style={{ marginTop: 6 }}>Uses index futures (equities), 10Y note futures (rates), spot (FX), CDX (credit), listed options then futures (exotics), front-month futures (commodities). Basis and idiosyncratic risk remain.</T>
      </Section>

      <Section title="Stress tests (instantaneous)">
        <Card>
          {risk.stress.map((x) => (
            <View key={x.id} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" color={C.text} style={{ flex: 1 }}>{x.name}</T>
                <T v="num" color={signColor(x.total)}>{fmSigned(x.total)}</T>
              </Row>
              <T v="caption">{x.desc}</T>
              <T v="caption" color={C.textDim}>{d.name}: {fmSigned(x.byDesk[desk])}</T>
            </View>
          ))}
          <T v="caption" style={{ marginTop: 6 }}>Full revaluation of every position under historical-style scenarios. VaR says how bad a normal bad day is; stress tests ask what happens on a day that isn't normal.</T>
        </Card>
      </Section>

      <Section title="Capital">
        <Card>
          {unlocked.map((x) => (
            <KV key={x} k={DESK_META[x].name} v={`${fm(risk.cap[x].total)} / ${fm(s.desks[x].capital)}`} tone={risk.cap[x].total > s.desks[x].capital ? C.down : undefined} sub="used / allocated" onPress={() => ex.open(() => explainCapital(s, x, risk.v, risk.worstByDesk[x]))} />
          ))}
          <KV k="Total capital used" v={fm(risk.capTotal)} />
          <LearnLink topic="capital" />
        </Card>
      </Section>

      <Section title="Counterparty exposure">
        <Card>
          {cpty.length ? (
            cpty.map(([id, e]) => <KV key={id} k={s.clients[id]?.name ?? id} v={fm(e.ead)} sub={`MTM ${fm(e.mtm)} + PFE ${fm(e.addon)}`} onPress={() => nav.push({ name: 'client', id })} />)
          ) : (
            <T v="small">No material uncollateralised derivative exposure.</T>
          )}
          <LearnLink topic="swaps" />
        </Card>
      </Section>
    </Screen>
  );
}
