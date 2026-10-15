import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fxSpotHalfSpread, halfSpreadUnit, unitNotional } from '../../engine/book';
import { fm, fmSigned, fpct, fq } from '../../engine/format';
import { pairCcys, PAIRS, usdPer } from '../../engine/market';
import { autocallPayoffPV, isFuture } from '../../engine/pricing';
import type { DeskId, Rfq } from '../../engine/types';
import { topicsFor } from '../../game/education';
import { displaySpread, hedgeIdeas, hitRatio, priceForHit, quoteScale, rfqEconomics, rfqSummary, autocallWinCoupon, type HedgeIdea, type QuoteResult } from '../../game/rfq';
import { DESK_META } from '../../game/setup';
import { LearnLink } from '../components/Learn';
import { Screen } from '../components/Screen';
import { Bar, Btn, Card, KV, Pill, Row, Section, Segmented, Sheet, Stepper, T } from '../components/ui';
import { useGame } from '../GameContext';
import { CLIENT_TYPE, instName, kindLabel, priceLabel } from '../labels';
import { C, S, signColor } from '../theme';
import { DESKS } from '../useRisk';

export function TradingScreen() {
  const g = useGame();
  const s = g.s!;
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const [sel, setSel] = useState<string | null>(null);
  const open = s.rfqs.filter((r) => r.status === 'open');
  const done = s.rfqs.filter((r) => r.status !== 'open');
  const list = filter === 'open' ? open : done;
  const won = done.filter((r) => r.status === 'won');
  const captured = won.reduce((a, r) => a + (r.spreadCapture ?? 0), 0);
  return (
    <Screen title="Trading" subtitle={`${open.length} open · ${won.length} won · ${fmSigned(captured)} captured`}>
      <View style={{ marginTop: S.md }}>
        <Segmented value={filter} options={[{ id: 'open', label: `Open RFQs (${open.length})` }, { id: 'done', label: `Done (${done.length})` }]} onChange={setFilter} />
      </View>
      {list.length === 0 ? (
        <Card style={{ marginTop: S.md }}>
          <T v="small">{filter === 'open' ? 'No open client requests. Hedge your book below or close the day on the Desk tab.' : 'Nothing priced yet today.'}</T>
        </Card>
      ) : null}
      {list.map((r) => (
        <RfqCard key={r.id} r={r} onPress={() => setSel(r.id)} />
      ))}
      <WorkingOrders />
      <StreetTicket />
      <RfqSheet id={sel} onClose={() => setSel(null)} />
    </Screen>
  );
}

function RfqCard({ r, onPress }: { r: Rfq; onPress: () => void }) {
  const g = useGame();
  const s = g.s!;
  const c = s.clients[r.clientId];
  const meta = DESK_META[r.desk];
  const statusColor = r.status === 'won' ? C.up : r.status === 'lost' ? C.down : r.status === 'open' ? C.accent : C.textFaint;
  return (
    <Card style={{ marginTop: 8 }} onPress={r.status === 'open' ? onPress : undefined} accent={r.status === 'open' && r.urgency === 'high' ? C.warn : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <T v="caption">{r.time}</T>
          <Pill text={meta.short} color={meta.color} />
          <T v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{c.name}</T>
        </Row>
        <Pill text={r.status} color={statusColor} filled={r.status !== 'open'} />
      </Row>
      <T v="h3" style={{ marginTop: 6, fontSize: 14.5 }}>{rfqSummary(s, r)}</T>
      <Row gap={12} style={{ marginTop: 4 }}>
        <T v="caption">{CLIENT_TYPE[c.type].label}</T>
        <T v="caption">{r.nDealers} dealers</T>
        <T v="caption">{r.urgency === 'high' ? 'urgent' : r.urgency === 'low' ? 'no rush' : ''}</T>
      </Row>
      {r.status === 'won' ? <T v="caption" color={C.up} style={{ marginTop: 4 }}>Captured {fm(r.spreadCapture ?? 0)} vs mid</T> : null}
      {r.status === 'lost' && r.cover !== undefined ? <T v="caption" color={C.down} style={{ marginTop: 4 }}>Lost: you {displaySpread(s, r, r.quotedHalfSpread ?? 0)}, winner ~{displaySpread(s, r, r.cover)}</T> : null}
    </Card>
  );
}

function RfqSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const g = useGame();
  const s = g.s!;
  const r = id ? s.rfqs.find((x) => x.id === id) : undefined;
  return (
    <Sheet visible={!!r} onClose={onClose} title={r ? `${r.time} · ${s.clients[r.clientId].name}` : ''}>
      {r ? <RfqBody key={r.id} r={r} onClose={onClose} /> : null}
    </Sheet>
  );
}

function RfqBody({ r, onClose }: { r: Rfq; onClose: () => void }) {
  const g = useGame();
  const s = g.s!;
  const c = s.clients[r.clientId];
  const inst = s.instruments[r.instId];
  const isAuto = inst?.kind === 'autocall';
  const econ = useMemo(() => rfqEconomics(s, r), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sc = useMemo(() => quoteScale(s, r), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fairCoupon = useMemo(() => (isAuto ? autocallWinCoupon(s, r) * 400 : 0), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const snap = (x: number) => Math.max(sc.step, Math.round(x / sc.step) * sc.step);
  const street = useMemo(() => (isAuto ? 0 : priceForHit(s, r, 0.5)), [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qd, setQd] = useState(() => (isAuto ? Math.ceil(fairCoupon * 10) / 10 : snap(street / sc.perDisplay)));
  const [res, setRes] = useState<QuoteResult | null>(null);
  const [done, setDone] = useState<Record<number, number>>({});
  const q = qd * sc.perDisplay;
  const hit = useMemo(() => (isAuto ? null : hitRatio(s, r, q)), [qd]); // eslint-disable-line react-hooks/exhaustive-deps
  const autoMargin = useMemo(() => (isAuto ? 1 - autocallPayoffPV(s.market, { ...(inst as any), coupon: qd / 400 }) : 0), [qd]); // eslint-disable-line react-hooks/exhaustive-deps
  const qtyAbs = Math.abs(r.clientQty);
  const edge = isAuto ? autoMargin * r.notional : q * qtyAbs;
  const restricted = s.desks[r.desk].restrictedUntil > s.day;
  const kind = r.instId.startsWith('SPOT:') ? 'spot' : inst?.kind ?? '';
  const ideas = useMemo(() => (res?.won ? hedgeIdeas(s, r.desk, res.newInstId ?? r.instId, -r.clientQty) : []), [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = isAuto ? 0.5 : (hit ?? 0);

  return (
    <View>
      <Row gap={6}>
        <Pill text={DESK_META[r.desk].short} color={DESK_META[r.desk].color} />
        <Pill text={kindLabel(inst, r.instId)} color={C.textDim} />
        {r.urgency === 'high' ? <Pill text="urgent" color={C.warn} /> : null}
      </Row>
      <T v="h2" style={{ marginTop: 8 }}>{rfqSummary(s, r)}</T>
      {r.note ? <T v="small" color={C.text} style={{ marginTop: 6 }}>{r.note}</T> : null}

      <Card style={{ marginTop: S.md }}>
        <KV k="Instrument" v={instName(s, r.instId)} />
        <KV k="Mid" v={priceLabel(s, r.instId)} />
        <KV k="Notional" v={fm(r.notional)} />
        <KV k={`Atlas would ${-r.clientQty > 0 ? 'buy / go long' : 'sell / go short'}`} v={fq(-r.clientQty)} sub={r.instId.startsWith('SPOT:') ? r.instId.slice(5, 8) : 'units'} />
        {econ.invQty ? <KV k="Existing inventory" v={fq(econ.invQty)} tone={Math.sign(econ.invQty) !== Math.sign(-r.clientQty) ? C.up : C.warn} /> : null}
        <KV k="Dealers in competition" v={String(r.nDealers)} />
      </Card>

      <Card style={{ marginTop: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="label">Client</T>
          <T v="caption">{CLIENT_TYPE[c.type].label} · relationship {Math.round(c.relationship)}</T>
        </Row>
        <T v="small" style={{ marginTop: 4 }}>{CLIENT_TYPE[c.type].blurb}</T>
        <T v="caption" style={{ marginTop: 4 }}>History: {c.wins} won of {c.rfqs} RFQs · {c.noQuotes} not quoted · revenue {fm(c.revenue)}</T>
      </Card>

      {res ? (
        <View>
          <Card style={{ marginTop: S.md }} accent={res.won ? C.up : C.down}>
            <T v="h3" color={res.won ? C.up : C.down}>{res.won ? 'Done' : 'Not done'}</T>
            <T v="small" color={C.text} style={{ marginTop: 4 }}>{res.message}</T>
          </Card>
          {res.won && ideas.length ? (
            <Section title="Hedge the new risk">
              {ideas.map((h, i) => (
                <HedgeRow key={i} h={h} desk={r.desk} done={done[i]} onDone={(cost) => setDone({ ...done, [i]: cost })} />
              ))}
              <T v="caption" style={{ marginTop: 6 }}>Or keep the risk: it shows in Book and Risk, and the close will mark it to market.</T>
            </Section>
          ) : null}
          <Btn title="Back to RFQs" tone="ghost" style={{ marginTop: S.lg }} onPress={onClose} />
        </View>
      ) : (
        <View>
          <Section title="Pricing">
            <Card>
              {isAuto ? (
                <>
                  <T v="small">Investors pay par. You set the annual coupon; the note's fair value at that coupon determines your issuance margin.</T>
                  <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                    <T v="small" color={C.text}>Coupon (% p.a.)</T>
                    <Stepper value={qd} min={1} max={24} step={sc.step} format={(x) => `${x.toFixed(sc.dp)}%`} onChange={setQd} />
                  </Row>
                  <KV k="Fair value of the note" v={`${((1 - autoMargin) * 100).toFixed(2)}%`} />
                  <KV k="Your issuance margin" v={`${(autoMargin * 100).toFixed(2)}% = ${fm(autoMargin * r.notional)}`} tone={signColor(autoMargin)} />
                  <KV k="Private bank's minimum coupon" v={`${fairCoupon.toFixed(2)}%`} />
                  <T v="caption" style={{ marginTop: 4 }}>The private bank tells you the coupon other issuers are showing (they work on ~1% margins; a strong relationship lets you keep up to ~1.8%). Below it you lose the deal; above it you give margin away. Once issued, you are short the note's embedded options: long-dated vega, skew and gap risk to hedge.</T>
                </>
              ) : (
                <>
                  {econ.lines.map((l) => (
                    <KV key={l.label} k={l.label} v={l.value} />
                  ))}
                  <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                    <T v="small" color={C.text}>Your half-spread</T>
                    <Stepper value={qd} min={0} max={Math.max(sc.step * 40, (econ.fair / sc.perDisplay) * 6)} step={sc.step} format={(x) => `${x.toFixed(sc.dp)} ${sc.unit}`} onChange={setQd} />
                  </Row>
                  <View style={{ marginTop: 12 }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <T v="caption">Estimated win probability</T>
                      <T v="num" color={fill > 0.6 ? C.up : fill > 0.3 ? C.warn : C.down}>{fpct(fill, 0)}</T>
                    </Row>
                    <Bar value={fill} max={1} color={fill > 0.6 ? C.up : fill > 0.3 ? C.warn : C.down} />
                  </View>
                  <KV k="Estimated 50/50 level vs competitors" v={displaySpread(s, r, street)} />
                  <KV k="Spread captured if done" v={fm(edge)} tone={C.up} />
                  <KV k="Margin over full cost" v={fmSigned((q - econ.fair) * qtyAbs)} tone={signColor(q - econ.fair)} />
                  <KV k="Expected (win prob × capture)" v={fm(edge * fill)} />
                  <T v="caption" style={{ marginTop: 4 }}>Full cost prices in hedging and a charge for the risk you can't hedge. Competitors quote around it — the less you charge for risk, the more often you win. Capture is booked against mid immediately; whether you keep it depends on hedging and on whether this client knows something.</T>
                </>
              )}
            </Card>
          </Section>
          {restricted ? <T v="small" color={C.down} style={{ marginTop: S.md }}>Risk management has restricted {DESK_META[r.desk].name} from taking new client risk until day {s.desks[r.desk].restrictedUntil}.</T> : null}
          <Row gap={8} style={{ marginTop: S.lg }}>
            <Btn title="Pass" tone="ghost" style={{ flex: 1 }} onPress={() => { g.pass(r.id); onClose(); }} />
            <Btn
              title={isAuto ? 'Offer the coupon' : 'Send quote'}
              tone="primary"
              style={{ flex: 2 }}
              disabled={restricted}
              onPress={() => {
                const out = g.quote(r.id, q, isAuto ? qd / 400 : undefined);
                if (out) setRes(out);
              }}
            />
          </Row>
          <View style={{ marginTop: S.md }}>
            {topicsFor(kind).map((t) => (
              <LearnLink key={t} topic={t} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function HedgeRow({ h, desk, done, onDone }: { h: HedgeIdea; desk: DeskId; done?: number; onDone: (cost: number) => void }) {
  const g = useGame();
  const s = g.s!;
  return (
    <Card style={{ marginBottom: 8 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 14 }}>{h.label}</T>
          <T v="caption" style={{ marginTop: 2 }}>{h.qty > 0 ? 'Buy' : 'Sell'} {fq(Math.abs(h.qty))} {instName(s, h.instId)}</T>
          <T v="small" style={{ marginTop: 4 }}>{h.rationale}</T>
          <T v="caption" style={{ marginTop: 4 }}>Est. cost {fm(h.cost)}{h.working ? ' over 3 days' : ''}</T>
        </View>
        {done !== undefined ? (
          <Ionicons name="checkmark-circle" size={24} color={C.up} />
        ) : (
          <Btn title={h.working ? 'Start' : 'Execute'} small tone="primary" onPress={() => onDone(g.hedge(desk, h))} />
        )}
      </Row>
      {done !== undefined && !h.working ? <T v="caption" color={C.textDim} style={{ marginTop: 4 }}>Executed · cost {fm(-done)}</T> : null}
    </Card>
  );
}

function WorkingOrders() {
  const g = useGame();
  const s = g.s!;
  if (!s.orders.length) return null;
  return (
    <Section title="Working orders">
      <Card>
        {s.orders.map((o) => (
          <KV key={o.id} k={`${o.note} · ${instName(s, o.instId)}`} v={fq(o.qtyRemaining)} sub={`${o.daysLeft} days left`} />
        ))}
        <T v="caption" style={{ marginTop: 4 }}>A third of the remaining quantity executes at each close, with lower impact per slice.</T>
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- street ticket

function ticketList(s: ReturnType<typeof useGame>['s'] & object, desk: DeskId): string[] {
  const I = Object.values(s.instruments);
  const m = s.market;
  const byExpiry = (k: string, pred: (i: any) => boolean = () => true) => I.filter((i: any) => i.kind === k && !i.dynamic && pred(i) && (i.expiry ?? i.start ?? 99) > m.t).sort((a: any, b: any) => (a.expiry ?? a.start) - (b.expiry ?? b.start));
  switch (desk) {
    case 'eq':
      return [...byExpiry('eqFut').slice(0, 1).map((i) => i.id), 'USLC', ...I.filter((i) => i.kind === 'stock').map((i) => i.id), ...atmOptions(s)];
    case 'rates':
      return ['UST2Y', 'UST5Y', 'UST10Y', 'UST30Y', ...byExpiry('bondFut').map((i) => i.id), ...byExpiry('sofrFut').slice(0, 4).map((i) => i.id), 'NEWSWAP:2', 'NEWSWAP:5', 'NEWSWAP:10', 'NEWSWAP:30'];
    case 'fx':
      return PAIRS.map((p) => `SPOT:${p}`);
    case 'credit':
      return ['CDX-IG', 'CDX-HY', ...I.filter((i) => (i.kind === 'corp' || i.kind === 'cds') && !i.id.startsWith('CDX')).map((i) => i.id)];
    case 'cmdty':
      return ['WTI', 'NG', 'GOLD', 'COPPER', 'CORN'].flatMap((c) => byExpiry('cmdtyFut', (i) => i.cmdty === c).slice(0, 2).map((i) => i.id));
    case 'exotics':
      return [...byExpiry('eqFut').slice(0, 1).map((i) => i.id), ...atmOptions(s)];
  }
}

function atmOptions(s: NonNullable<ReturnType<typeof useGame>['s']>): string[] {
  const m = s.market;
  return Object.values(s.instruments)
    .filter((i) => i.kind === 'eqOpt' && !i.dynamic && i.expiry > m.t + 0.02)
    .sort((a: any, b: any) => Math.abs(a.strike - m.eq.spot.US500) - Math.abs(b.strike - m.eq.spot.US500))
    .slice(0, 4)
    .map((i) => i.id);
}

const SIZES = [1e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6, 500e6];

function StreetTicket() {
  const g = useGame();
  const s = g.s!;
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked);
  const [desk, setDesk] = useState<DeskId>('eq');
  const [inst, setInst] = useState<string | null>(null);
  const [size, setSize] = useState(3);
  const [msg, setMsg] = useState<string | null>(null);
  const list = ticketList(s, desk);
  const id = inst && list.includes(inst) ? inst : list[0];
  const notional = SIZES[size];
  const m = s.market;
  let unitNot = 1;
  let costPerUnit = 0;
  if (id.startsWith('SPOT:')) {
    const pair = id.slice(5);
    unitNot = usdPer(m, pairCcys(pair)[0]);
  } else if (id.startsWith('NEWSWAP:')) {
    unitNot = 1;
  } else unitNot = unitNotional(s, s.instruments[id], m);
  let qty = notional / unitNot;
  const fut = !id.startsWith('SPOT:') && !id.startsWith('NEWSWAP:') && (isFuture(s.instruments[id]) || s.instruments[id].kind === 'eqOpt');
  if (fut) qty = Math.max(1, Math.round(qty));
  if (id.startsWith('SPOT:')) costPerUnit = fxSpotHalfSpread(m, id.slice(5), qty) * usdPer(m, pairCcys(id.slice(5))[1]);
  else if (!id.startsWith('NEWSWAP:')) costPerUnit = halfSpreadUnit(s, s.instruments[id], qty, m);
  const go = (sign: number) => {
    const q = sign * qty;
    const c = id.startsWith('NEWSWAP:') ? g.hedge(desk, { label: 'D2D swap', instId: id, qty: q, rationale: '', cost: 0 }) : g.trade(desk, id, q);
    setMsg(`${id.startsWith('NEWSWAP:') ? (sign > 0 ? 'Received fixed on' : 'Paid fixed on') : sign > 0 ? 'Bought' : 'Sold'} ${fq(qty)} ${instName(s, id)} · execution cost ${fm(-c)}`);
  };
  return (
    <Section title="Street ticket (hedge / position)">
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {unlocked.map((d) => (
            <Pressable key={d} onPress={() => { setDesk(d); setInst(null); setMsg(null); }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: d === desk ? DESK_META[d].color + '33' : C.surface2, borderWidth: 1, borderColor: d === desk ? DESK_META[d].color : C.border }}>
              <T v="caption" color={d === desk ? C.text : C.textDim}>{DESK_META[d].short}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {list.map((x) => (
            <Pressable key={x} onPress={() => { setInst(x); setMsg(null); }} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: x === id ? C.accent + '26' : C.surface2, borderWidth: 1, borderColor: x === id ? C.accent : C.border }}>
              <T v="caption" color={x === id ? C.accent : C.textDim}>{x.startsWith('SPOT:') ? x.slice(5) : x.startsWith('NEWSWAP:') ? `${x.slice(8)}Y swap` : x}</T>
            </Pressable>
          ))}
        </View>
        <T v="small" color={C.text} style={{ marginTop: 10 }}>{instName(s, id)}</T>
        {!id.startsWith('NEWSWAP:') ? <T v="caption">Mid {priceLabel(s, id)}</T> : <T v="caption">Par swap in the inter-dealer market. Receiving fixed is long duration (like buying a bond); paying fixed is short duration.</T>}
        <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <T v="small">Notional</T>
          <Stepper value={size} min={0} max={SIZES.length - 1} step={1} format={(x) => fm(SIZES[x])} onChange={setSize} />
        </Row>
        <KV k="Quantity" v={fq(qty)} sub={fut ? 'contracts' : id.startsWith('SPOT:') ? id.slice(5, 8) : 'units / face'} />
        {!id.startsWith('NEWSWAP:') ? <KV k="Est. execution cost (half-spread + impact)" v={fm(costPerUnit * qty)} /> : null}
        <Row gap={8} style={{ marginTop: 10 }}>
          <Btn title={id.startsWith('NEWSWAP:') ? 'Pay fixed' : 'Sell'} tone="danger" style={{ flex: 1 }} onPress={() => go(-1)} />
          <Btn title={id.startsWith('NEWSWAP:') ? 'Receive fixed' : 'Buy'} tone="primary" style={{ flex: 1 }} onPress={() => go(1)} />
        </Row>
        {msg ? <T v="caption" color={C.text} style={{ marginTop: 8 }}>{msg}</T> : null}
      </Card>
    </Section>
  );
}
