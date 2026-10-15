import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { fm, fmSigned, fpct, fq } from '../../engine/format';
import type { DeskId } from '../../engine/types';
import { DESK_META } from '../../game/setup';
import { LearnLink } from '../components/Learn';
import { Screen } from '../components/Screen';
import { Bar, Card, KV, Pill, Row, Section, T } from '../components/ui';
import { useGame } from '../GameContext';
import { CLIENT_TYPE, instName } from '../labels';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { DESKS, useRisk } from '../useRisk';

export function ClientsScreen() {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const [desk, setDesk] = useState<DeskId>('eq');
  const clients = Object.values(s.clients).sort((a, b) => b.revenue - a.revenue);
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked);
  const league = [{ id: 'atlas', name: 'Atlas (you)', share: s.share[desk] ?? 0 }, ...Object.values(s.competitors).map((c) => ({ id: c.id, name: c.name, share: c.share[desk] ?? 0 }))].sort((a, b) => b.share - a.share);
  const maxShare = Math.max(...league.map((l) => l.share), 0.01);
  return (
    <Screen title="Clients" subtitle={`${clients.length} accounts · ${Object.keys(s.competitors).length} competing dealers`}>
      <Section title="Accounts">
        {clients.map((c) => {
          const hit = c.rfqs ? c.wins / c.rfqs : 0;
          return (
            <Card key={c.id} style={{ marginBottom: 8 }} onPress={() => nav.push({ name: 'client', id: c.id })} accent={c.defaulted ? C.down : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 14 }} numberOfLines={1}>{c.name}</T>
                  <T v="caption">{CLIENT_TYPE[c.type].label} · {c.desks.map((d) => DESK_META[d].short).join(' · ')}</T>
                </View>
                {c.defaulted ? <Pill text="defaulted" color={C.down} filled /> : <T v="num" color={signColor(c.revenue)}>{fmSigned(c.revenue)}</T>}
              </Row>
              <Row gap={8} style={{ marginTop: 8 }}>
                <T v="caption" style={{ width: 82 }}>Relationship {Math.round(c.relationship)}</T>
                <View style={{ flex: 1 }}>
                  <Bar value={c.relationship} max={100} color={c.relationship > 65 ? C.up : c.relationship < 35 ? C.down : C.accent} />
                </View>
              </Row>
              <Row gap={14} style={{ marginTop: 6 }}>
                <T v="caption">Hit rate {c.rfqs ? fpct(hit, 0) : '—'} ({c.wins}/{c.rfqs})</T>
                <T v="caption">Wallet share {fpct(c.share, 0)}</T>
                {c.noQuotes ? <T v="caption" color={C.warn}>{c.noQuotes} unanswered</T> : null}
              </Row>
            </Card>
          );
        })}
        <LearnLink topic="adverseSelection" />
      </Section>

      <Section title="League table · market share">
        <Card>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {unlocked.map((d) => (
              <Pressable key={d} onPress={() => setDesk(d)} hitSlop={4}>
                <Pill text={DESK_META[d].short} color={d === desk ? C.accent : C.textFaint} filled={d === desk} />
              </Pressable>
            ))}
          </Row>
          {league.map((l, i) => (
            <View key={l.id} style={{ paddingVertical: 5 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" color={l.id === 'atlas' ? C.accent : C.text}>{i + 1}. {l.name}</T>
                <T v="num" style={{ fontSize: 12.5 }}>{fpct(l.share, 1)}</T>
              </Row>
              <View style={{ marginTop: 3 }}>
                <Bar value={l.share} max={maxShare} height={4} color={l.id === 'atlas' ? C.accent : C.borderStrong} />
              </View>
            </View>
          ))}
          <T v="caption" style={{ marginTop: 6 }}>Share moves with how often you win client business, how reliably you quote (especially in stress) and electronic flow volume.</T>
        </Card>
      </Section>
      <Section title="Competitors">
        {Object.values(s.competitors).map((c) => (
          <Card key={c.id} style={{ marginBottom: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="h3" style={{ fontSize: 14 }}>{c.name}</T>
              <T v="caption">{c.strengths.map((d) => DESK_META[d].short).join(' · ')}</T>
            </Row>
            <T v="small" style={{ marginTop: 4 }}>{c.style}</T>
            <T v="caption" style={{ marginTop: 4 }}>Pricing {c.tightness < 0.9 ? 'very aggressive' : c.tightness < 1 ? 'aggressive' : c.tightness > 1 ? 'premium' : 'market'} · risk appetite {c.appetite >= 1 ? 'high' : 'moderate'}</T>
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

export function ClientDetail({ id }: { id: string }) {
  const g = useGame();
  const s = g.s!;
  const risk = useRisk()!;
  const c = s.clients[id];
  const trades = s.blotter.filter((b) => b.cpty === id).slice(-15).reverse();
  const exp = risk.cpty[id];
  return (
    <Screen title={c.name} subtitle={CLIENT_TYPE[c.type].label} back>
      <Card style={{ marginTop: S.md }}>
        <T v="small" color={C.text}>{CLIENT_TYPE[c.type].blurb}</T>
        <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {c.desks.map((d) => (
            <Pill key={d} text={DESK_META[d].name} color={DESK_META[d].color} />
          ))}
        </Row>
      </Card>
      <Section title="Relationship">
        <Card>
          <KV k="Relationship score" v={`${Math.round(c.relationship)}/100`} />
          <KV k="RFQs sent to Atlas" v={String(c.rfqs)} />
          <KV k="Won" v={String(c.wins)} />
          <KV k="Not quoted / lapsed" v={String(c.noQuotes)} tone={c.noQuotes ? C.warn : undefined} />
          <KV k="Quoted in stressed markets" v={String(c.stressLiquidity)} />
          <KV k="Atlas share of wallet" v={fpct(c.share, 1)} />
          <KV k="Revenue (spread captured)" v={fmSigned(c.revenue)} tone={signColor(c.revenue)} />
          <T v="caption" style={{ marginTop: 6 }}>Relationship rises when you trade and when you show liquidity in stress; it falls when you ignore requests or quote far off the market. Better relationships send more RFQs and let you win at slightly wider prices.</T>
        </Card>
      </Section>
      <Section title="Counterparty credit">
        <Card>
          <KV k="Internal rating" v={c.credit} />
          <KV k="Derivative MTM owed to Atlas" v={fm(exp?.mtm ?? 0)} tone={exp && exp.mtm > 0 ? C.warn : undefined} />
          <KV k="Potential future exposure add-on" v={fm(exp?.addon ?? 0)} />
          <KV k="Exposure at default" v={fm(exp?.ead ?? 0)} />
          <T v="caption" style={{ marginTop: 6 }}>Uncollateralised OTC derivatives leave Atlas exposed if the client fails while owing money on them.</T>
        </Card>
      </Section>
      <Section title="Recent trades">
        <Card>
          {trades.length ? (
            trades.map((t) => (
              <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={C.text} numberOfLines={1}>{instName(s, t.instId)}</T>
                  <T v="caption">Day {t.day} · Atlas {t.qty > 0 ? 'bought' : 'sold'} {fq(Math.abs(t.qty))}</T>
                </View>
                <T v="num" color={signColor(t.pnl)} style={{ fontSize: 12.5 }}>{fmSigned(t.pnl)}</T>
              </Row>
            ))
          ) : (
            <T v="small">No trades yet.</T>
          )}
        </Card>
      </Section>
    </Screen>
  );
}
