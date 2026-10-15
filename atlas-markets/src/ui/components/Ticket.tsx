import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deskValue } from '../../engine/book';
import { fm, fmSigned, fpct } from '../../engine/format';
import { autocallPayoffPV } from '../../engine/pricing';
import type { Rfq } from '../../engine/types';
import { autocallWinCoupon, displaySpread, hedgeIdeas, hitRatio, priceForHit, rfqEconomics, rfqSummary, type HedgeIdea, type QuoteResult } from '../../game/rfq';
import { DESK_META } from '../../game/setup';
import { useGame } from '../GameContext';
import { CLIENT_TYPE, instName, priceLabel } from '../labels';
import { useNav } from '../nav';
import { clientPrice, sideWords } from '../screens/Trading';
import { C, F, R, S, signColor } from '../theme';
import { Btn, Pill, Row, T } from './ui';
import { MAX_W } from './Screen';

const LEVELS: { label: string; hit: number; tone: string }[] = [
  { label: 'Aggressive', hit: 0.8, tone: C.up },
  { label: 'Competitive', hit: 0.5, tone: C.accent },
  { label: 'Wide', hit: 0.2, tone: C.warn },
];

/** Incoming client calls: a phone-call style ticket over whatever screen you are on. */
export function TicketOverlay() {
  const g = useGame();
  const s = g.s;
  const [snoozed, setSnoozed] = useState<Record<string, true>>({});
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<{ rfq: Rfq; res: QuoteResult; dv0: number } | null>(null);
  const next = s?.rfqs.find((r) => r.status === 'open' && r.arrived && !snoozed[r.id]);
  useEffect(() => {
    if (!result && next && next.id !== active) setActive(next.id);
    if (!next && !result) setActive(null);
  }, [next?.id, result]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    g.holdRfq(active);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || s.status !== 'playing') return null;
  if (result) return <ResultCard key={result.rfq.id} {...result} onDone={() => setResult(null)} />;
  const r = active ? s.rfqs.find((x) => x.id === active && x.status === 'open') : undefined;
  if (!r) return null;
  return (
    <QuoteCard
      key={r.id}
      r={r}
      onLater={() => {
        setSnoozed({ ...snoozed, [r.id]: true });
        setActive(null);
      }}
      onDone={(res) => {
        if (res) setResult({ rfq: r, res, dv0: deskValue(s, s.desks[r.desk]) });
        setActive(null);
      }}
    />
  );
}

function Shell({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <View pointerEvents="box-none" style={st.wrap}>
      <View style={[st.card, { borderTopColor: accent }]}>{children}</View>
    </View>
  );
}

function QuoteCard({ r, onLater, onDone }: { r: Rfq; onLater: () => void; onDone: (res: QuoteResult | null) => void }) {
  const g = useGame();
  const s = g.s!;
  const c = s.clients[r.clientId];
  const inst = s.instruments[r.instId];
  const isAuto = inst?.kind === 'autocall';
  const meta = DESK_META[r.desk];
  const restricted = s.desks[r.desk].restrictedUntil > s.day;
  const side = sideWords(s, r);
  // price levels are fixed when the call comes in; the all-in price moves with the live mid
  const levels = useMemo(() => {
    if (isAuto) {
      const need = autocallWinCoupon(s, r) * 400;
      return [
        { label: 'Generous', coupon: need + 0.4, tone: C.up },
        { label: 'At their level', coupon: Math.ceil((need + 0.02) * 10) / 10, tone: C.accent },
        { label: 'Stingy', coupon: Math.max(0.5, need - 0.6), tone: C.warn },
      ].map((l) => {
        const margin = 1 - autocallPayoffPV(s.market, { ...(inst as any), coupon: l.coupon / 400 });
        return { ...l, q: 0, hit: l.coupon >= need ? 0.97 : 0.02, profit: margin * r.notional };
      });
    }
    return LEVELS.map((l) => {
      const q = priceForHit(s, r, l.hit);
      return { ...l, coupon: 0, q, hit: hitRatio(s, r, q), profit: q * Math.abs(r.clientQty) };
    });
  }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fair = useMemo(() => (isAuto ? 0 : rfqEconomics(s, r).fair), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell accent={meta.color}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Ionicons name="call" size={14} color={C.up} />
          <T v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{c.name}</T>
        </Row>
        <Pill text={meta.short} color={meta.color} />
      </Row>
      <T v="caption" style={{ marginTop: 2 }}>{CLIENT_TYPE[c.type].label} · relationship {Math.round(c.relationship)} · {r.nDealers > 1 ? `${r.nDealers} dealers asked` : 'only you asked'}</T>
      <T v="h2" style={{ marginTop: 8 }}>{rfqSummary(s, r)}</T>
      {!isAuto ? (
        <Row style={{ marginTop: 4, justifyContent: 'space-between' }}>
          <T v="small">
            You <T v="small" color={C.accent}>{side.you.toLowerCase()}</T> · mid <T v="small" color={C.text} style={F.num}>{priceLabel(s, r.instId).split(' · ')[0]}</T>
          </T>
          <T v="caption">{instName(s, r.instId).length < 26 ? instName(s, r.instId) : ''}</T>
        </Row>
      ) : (
        <T v="small" style={{ marginTop: 4 }}>Investors pay par; you choose the coupon and keep the gap to fair value — and the hedging risk.</T>
      )}
      {r.note && r.note.length < 140 ? <T v="caption" style={{ marginTop: 4 }}>{r.note}</T> : null}
      <View style={{ gap: 8, marginTop: 12 }}>
        {levels.map((l) => (
          <Pressable
            key={l.label}
            disabled={restricted}
            onPress={() => onDone(g.quote(r.id, isAuto ? 1 : l.q, isAuto ? l.coupon / 400 : undefined))}
            style={({ pressed }) => [st.level, { borderColor: l.tone + '66', opacity: restricted ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <View style={{ flex: 1 }}>
              <T v="small" color={l.tone} style={{ fontWeight: '700' }}>{l.label}</T>
              <T v="caption">{isAuto ? `${l.coupon.toFixed(2)}% coupon` : `${clientPrice(s, r, l.q)} · ${displaySpread(s, r, l.q).split(' (')[0]}`}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="num" color={signColor(l.profit)}>{fmSigned(l.profit)}</T>
              <T v="caption">{fpct(l.hit, 0)} to win{!isAuto && l.q < fair ? ' · below full cost' : ''}</T>
            </View>
          </Pressable>
        ))}
      </View>
      {restricted ? <T v="caption" color={C.down} style={{ marginTop: 6 }}>Risk has restricted {meta.name} from new client risk until day {s.desks[r.desk].restrictedUntil}.</T> : null}
      <Row gap={8} style={{ marginTop: 10 }}>
        <Btn title="Decline" small tone="ghost" style={{ flex: 1 }} onPress={() => { g.pass(r.id); onDone(null); }} />
        <Btn title="Later" small tone="ghost" style={{ flex: 1 }} onPress={onLater} />
      </Row>
    </Shell>
  );
}

function ResultCard({ rfq, res, dv0, onDone }: { rfq: Rfq; res: QuoteResult; dv0: number; onDone: () => void }) {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const [hedged, setHedged] = useState<number | null>(null);
  const idea: HedgeIdea | undefined = useMemo(() => {
    if (!res.won) return undefined;
    const ideas = hedgeIdeas(s, rfq.desk, res.newInstId ?? rfq.instId, -rfq.clientQty);
    return ideas.find((i) => !i.working) ?? ideas[0];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const move = deskValue(s, s.desks[rfq.desk]) - dv0;
  if (!res.won)
    return (
      <Shell accent={C.down}>
        <Row gap={8}>
          <Ionicons name="close-circle" size={22} color={C.down} />
          <T v="h2" color={C.down}>Missed</T>
        </Row>
        <T v="small" color={C.text} style={{ marginTop: 6 }}>{res.message}</T>
        <T v="caption" style={{ marginTop: 6 }}>No risk taken. If you keep losing a client's business, their relationship (and future calls) fade.</T>
        <Btn title="Back to the floor" tone="primary" style={{ marginTop: 12 }} onPress={onDone} />
      </Shell>
    );
  return (
    <Shell accent={C.up}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Ionicons name="checkmark-circle" size={22} color={C.up} />
          <T v="h2" color={C.up}>Done</T>
        </Row>
        <T v="numLg" color={C.up}>{fmSigned(res.edge)}</T>
      </Row>
      <T v="small" color={C.text} style={{ marginTop: 6 }}>
        You {sideWords(s, rfq).you.toLowerCase()} {fm(rfq.notional)} {instName(s, res.newInstId ?? rfq.instId)}. Spread booked {fmSigned(res.edge)} — now you hold the risk.
      </T>
      <View style={st.live}>
        <T v="caption">Market move on {DESK_META[rfq.desk].name} since the trade</T>
        <T v="numLg" color={signColor(move)}>{fmSigned(move)}</T>
      </View>
      {idea && hedged === null ? (
        <>
          <Btn title={`Hedge: ${idea.label}`} tone="primary" style={{ marginTop: 10 }} onPress={() => { setHedged(g.hedge(rfq.desk, idea)); g.notify(`Hedged: ${idea.label}`, 'neutral'); }} />
          <T v="caption" style={{ marginTop: 4 }}>{idea.rationale} Est. cost {fm(idea.cost)}.</T>
          <Row gap={8} style={{ marginTop: 8 }}>
            <Btn title="Hold the risk" small tone="ghost" style={{ flex: 1 }} onPress={onDone} />
            <Btn title="Other hedges" small tone="ghost" style={{ flex: 1 }} onPress={() => { onDone(); nav.push({ name: 'position', desk: rfq.desk, id: res.newInstId ?? rfq.instId }); }} />
          </Row>
        </>
      ) : (
        <>
          {hedged !== null ? <T v="caption" style={{ marginTop: 8 }}>{idea?.working ? 'Working order started — it executes over the next closes.' : `Hedged for ${fm(-hedged)}. The main risk is off; basis risk remains.`}</T> : null}
          <Btn title="Back to the floor" tone="primary" style={{ marginTop: 10 }} onPress={onDone} />
        </>
      )}
    </Shell>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 8 },
  card: {
    width: '100%',
    maxWidth: MAX_W,
    backgroundColor: C.surface2,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 3,
    padding: S.lg,
    paddingBottom: S.md,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderStrong,
  },
  level: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.md, borderWidth: 1, backgroundColor: C.surface },
  live: { marginTop: 10, padding: 10, borderRadius: R.md, backgroundColor: C.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
