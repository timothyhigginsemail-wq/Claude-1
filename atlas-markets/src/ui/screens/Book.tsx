import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cashUsd, deskValue, positionValue, unitNotional } from '../../engine/book';
import { fm, fmSigned, fq } from '../../engine/format';
import { usdPer } from '../../engine/market';
import { bump, factorKeys } from '../../engine/risk';
import type { Ccy, DeskId } from '../../engine/types';
import { topicsFor } from '../../game/education';
import { explainDeskValue, explainInstrument } from '../../game/explainers';
import { hedgeIdeas } from '../../game/rfq';
import { DESK_META } from '../../game/setup';
import { LearnLink } from '../components/Learn';
import { Screen } from '../components/Screen';
import { Btn, Card, KV, Metric, Pill, Row, Section, T } from '../components/ui';
import { useGame } from '../GameContext';
import { instName, kindLabel, priceLabel } from '../labels';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { DESKS, useRisk } from '../useRisk';
import { HedgeRow } from './Trading';

export function DeskChips({ value, onChange }: { value: DeskId; onChange: (d: DeskId) => void }) {
  const g = useGame();
  const s = g.s!;
  return (
    <Row gap={6} style={{ flexWrap: 'wrap', marginTop: S.md }}>
      {DESKS.filter((d) => s.desks[d].unlocked).map((d) => (
        <Pressable key={d} onPress={() => onChange(d)} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, backgroundColor: d === value ? DESK_META[d].color + '33' : C.surface, borderWidth: 1, borderColor: d === value ? DESK_META[d].color : C.border }}>
          <T v="caption" color={d === value ? C.text : C.textDim} style={{ fontWeight: '700' }}>{DESK_META[d].short}</T>
        </Pressable>
      ))}
    </Row>
  );
}

export function BookScreen() {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const risk = useRisk()!;
  const [desk, setDesk] = useState<DeskId>('eq');
  const d = s.desks[desk];
  const m = s.market;
  const rows = Object.values(d.positions)
    .map((p) => {
      const inst = s.instruments[p.instId];
      return { p, inst, pv: positionValue(inst, p, m), notional: Math.abs(p.qty) * unitNotional(s, inst, m) };
    })
    .sort((a, b) => b.notional - a.notional);
  const cash = Object.entries(d.cash).filter(([, v]) => Math.abs(v ?? 0) > 1);
  const sum = risk.sum[desk];
  return (
    <Screen title="Book" subtitle={`${d.name} · ${rows.length} positions`} right={
      <Pressable onPress={() => nav.push({ name: 'blotter' })} hitSlop={10}>
        <Ionicons name="list-outline" size={22} color={C.textDim} />
      </Pressable>
    }>
      <DeskChips value={desk} onChange={setDesk} />
      <Row gap={8} style={{ marginTop: S.md }}>
        <Metric label="Book value" value={fm(deskValue(s, d))} calc={() => explainDeskValue(s, desk)} sub="cash + mark-to-market" />
        <Metric label="Gross long / short" value={`${fm(sum.grossLong)}`} sub={`short ${fm(sum.grossShort)}`} />
      </Row>
      {cash.length ? (
        <Section title="Cash balances">
          <Card>
            {cash.map(([c, v]) => (
              <KV key={c} k={c} v={`${fq(v ?? 0)} ${c}`} sub={c === 'USD' ? undefined : `≈ ${fm((v ?? 0) * usdPer(m, c as Ccy))}`} tone={signColor(v ?? 0)} />
            ))}
            <KV k="Total in USD" v={fm(cashUsd(d, m))} />
            <T v="caption" style={{ marginTop: 4 }}>Trading cash includes premiums received, coupons, financing and the proceeds of short sales. Non-USD balances are FX exposure and earn/pay that currency's interest rate.</T>
          </Card>
        </Section>
      ) : null}
      <Section title="Positions">
        {rows.length ? (
          rows.map(({ p, inst, pv, notional }) => (
            <Card key={p.instId} style={{ marginBottom: 8 }} onPress={() => nav.push({ name: 'position', desk, id: p.instId })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 14 }} numberOfLines={1}>{inst.name}</T>
                  <T v="caption">{kindLabel(inst, p.instId)} · {p.qty > 0 ? 'long' : 'short'} {fq(Math.abs(p.qty))} · {fm(notional)} notional</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="num" color={signColor(pv)}>{fm(pv)}</T>
                  <T v="caption">{priceLabel(s, p.instId)}</T>
                </View>
              </Row>
            </Card>
          ))
        ) : (
          <Card>
            <T v="small">Flat. Win client trades in Trading, or put on positions with the street ticket.</T>
          </Card>
        )}
        <T v="caption" style={{ marginTop: 4 }}>Futures show zero value: gains and losses settle to cash daily as variation margin.</T>
      </Section>
    </Screen>
  );
}

const BUMP_LABEL = (k: string) => {
  const [a, b] = k.split(':');
  switch (a) {
    case 'eq':
      return `${b} +1%`;
    case 'vol':
      return `${b} vol +1pt`;
    case 'rates':
      return 'Rates +1bp (parallel)';
    case 'kr':
      return `${b}Y key rate +1bp`;
    case 'ccy':
      return `${b} rates +1bp`;
    case 'cr':
      return `${b} spread +1bp`;
    case 'fx':
      return `${b} +1% vs USD`;
    case 'fxvol':
      return `${b} vol +1pt`;
    case 'cm':
      return `${b} +1%`;
    case 'cmvol':
      return `${b} vol +1pt`;
    case 'time':
      return 'One day passes';
    default:
      return k;
  }
};
const SIZE: Record<string, number> = { eq: 0.01, vol: 0.01, rates: 0.0001, kr: 0.0001, ccy: 0.0001, cr: 1, fx: 0.01, fxvol: 0.01, cm: 0.01, cmvol: 0.01, time: 1 / 365 };

export function PositionDetail({ desk, id }: { desk: DeskId; id: string }) {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const m = s.market;
  const p = s.desks[desk].positions[id];
  const inst = s.instruments[id];
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, number>>({});
  const sens = useMemo(() => {
    if (!p) return [];
    const base = positionValue(inst, p, m);
    return factorKeys(inst).map((k) => ({ k, v: positionValue(inst, p, bump(m, k, SIZE[k.split(':')[0]])) - base })).filter((x) => Math.abs(x.v) > 1);
  }, [g.v]); // eslint-disable-line react-hooks/exhaustive-deps
  const ideas = useMemo(() => (p ? hedgeIdeas(s, desk, id, p.qty) : []), [g.v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p || !inst) {
    return (
      <Screen title="Position closed" back>
        <Card style={{ marginTop: S.md }}>
          <T v="small">{msg ?? 'This position is now flat.'}</T>
          <Btn title="Back to the book" style={{ marginTop: 10 }} onPress={nav.pop} />
        </Card>
      </Screen>
    );
  }
  const pv = positionValue(inst, p, m);
  const cpty = p.cpty ? s.clients[p.cpty] : undefined;
  return (
    <Screen title={inst.name} subtitle={`${DESK_META[desk].name} · ${kindLabel(inst, id)}`} back>
      <Row gap={8} style={{ marginTop: S.md }}>
        <Metric label="Position value" value={fm(pv)} tone={signColor(pv)} calc={() => explainInstrument(s, inst, p.qty)} sub={p.qty < 0 && ['stock', 'etf', 'ust', 'corp'].includes(inst.kind) ? 'short: sale proceeds sit in cash' : 'mark-to-market'} />
        <Metric label="Position" value={fq(p.qty)} sub={`${fm(Math.abs(p.qty) * unitNotional(s, inst, m))} notional`} />
      </Row>
      <Card style={{ marginTop: 8 }}>
        <KV k="Market price" v={priceLabel(s, id)} />
        <KV k="Opened" v={`Day ${p.openedDay}`} />
        {cpty ? <KV k="Counterparty" v={cpty.name} onPress={() => nav.push({ name: 'client', id: cpty.id })} /> : null}
        {p.ref !== undefined ? <KV k="Last settlement (variation margin)" v={p.ref.toFixed(3)} /> : null}
      </Card>
      <Section title="Sensitivities">
        <Card>
          {sens.length ? sens.map((x) => <KV key={x.k} k={BUMP_LABEL(x.k)} v={fmSigned(x.v)} tone={signColor(x.v)} />) : <T v="small">No material sensitivities.</T>}
          <T v="caption" style={{ marginTop: 4 }}>Each line revalues the position with one market input bumped (full revaluation, not a formula approximation).</T>
        </Card>
      </Section>
      {ideas.length ? (
        <Section title="Hedge or reduce">
          {ideas.map((h, i) => (
            <HedgeRow key={i} h={h} desk={desk} done={done[i]} onDone={(c) => setDone({ ...done, [i]: c })} />
          ))}
        </Section>
      ) : null}
      {inst.kind !== 'autocall' ? (
        <Row gap={8} style={{ marginTop: S.lg }}>
          <Btn title="Unwind 50%" tone="ghost" style={{ flex: 1 }} onPress={() => setMsg(`Unwound half: cost ${fm(-g.unwind(desk, id, 0.5))}.`)} />
          <Btn title="Close out" tone="danger" style={{ flex: 1 }} onPress={() => setMsg(`Closed: cost ${fm(-g.unwind(desk, id, 1))}.`)} />
        </Row>
      ) : (
        <T v="caption" style={{ marginTop: S.lg }}>Issued notes cannot be bought back; hedge their delta and vega instead.</T>
      )}
      {msg ? <T v="small" color={C.text} style={{ marginTop: 8 }}>{msg}</T> : null}
      <View style={{ marginTop: S.md }}>
        {topicsFor(inst.kind).map((t) => (
          <LearnLink key={t} topic={t} />
        ))}
      </View>
    </Screen>
  );
}

export function BlotterScreen() {
  const g = useGame();
  const s = g.s!;
  const [desk, setDesk] = useState<DeskId | 'all'>('all');
  const rows = s.blotter.filter((b) => desk === 'all' || b.desk === desk).slice(-80).reverse();
  return (
    <Screen title="Blotter" subtitle="Every trade, newest first" back>
      <Row gap={6} style={{ flexWrap: 'wrap', marginTop: S.md }}>
        {(['all', ...DESKS.filter((d) => s.desks[d].unlocked)] as const).map((d) => (
          <Pressable key={d} onPress={() => setDesk(d)} hitSlop={4}>
            <Pill text={d === 'all' ? 'All' : DESK_META[d].short} color={d === desk ? C.accent : C.textFaint} filled={d === desk} />
          </Pressable>
        ))}
      </Row>
      <Card style={{ marginTop: S.md }}>
        {rows.length ? (
          rows.map((b) => (
            <Row key={b.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <View style={{ flex: 1 }}>
                <T v="small" color={C.text} numberOfLines={1}>{instName(s, b.instId)}</T>
                <T v="caption">D{b.day} · {b.kind} · {b.qty > 0 ? 'buy' : 'sell'} {fq(Math.abs(b.qty))} @ {b.price.toFixed(b.price > 100 ? 2 : 4)} · {b.cpty === 'street' || b.cpty === 'flow' ? b.cpty : s.clients[b.cpty]?.name.split(' ')[0] ?? b.cpty}</T>
              </View>
              <T v="num" color={signColor(b.pnl)} style={{ fontSize: 12.5 }}>{fmSigned(b.pnl)}</T>
            </Row>
          ))
        ) : (
          <T v="small">No trades yet.</T>
        )}
        <T v="caption" style={{ marginTop: 6 }}>Right column: spread captured (client trades) or execution cost paid (street trades) versus mid.</T>
      </Card>
    </Screen>
  );
}

export function LogScreen() {
  const g = useGame();
  const s = g.s!;
  return (
    <Screen title="Desk log" back>
      <Card style={{ marginTop: S.md, gap: 8 }}>
        {[...s.log].reverse().map((l, i) => (
          <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
            <T v="caption" style={{ width: 30 }}>D{l.day}</T>
            <T v="small" color={l.tone === 'good' ? C.up : l.tone === 'bad' ? C.down : C.text} style={{ flex: 1 }}>{l.text}</T>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
