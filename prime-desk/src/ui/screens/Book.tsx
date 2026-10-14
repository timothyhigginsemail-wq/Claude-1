import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { fm, fpct } from '../../engine/format';
import { borrowTier, clientFee, COLLATERAL_MARGIN, externalSupply, internalSupply, lenderFee, utilisation } from '../../engine/lending';
import type { GameState } from '../../engine/types';
import { FlowDiagram, Sparkline } from '../components/charts';
import { Screen, useContentWidth } from '../components/Screen';
import { Card, KV, Metric, Pill, Row, Section, Segmented, T } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { calc } from '../../engine/explain';

interface SecRow {
  id: string;
  long: number;
  short: number;
  internal: number;
  external: number;
  shortfall: number;
  fee: number;
  tier: string;
}

function bookRows(s: GameState): SecRow[] {
  const rows: Record<string, SecRow> = {};
  for (const c of Object.values(s.clients)) {
    if (c.status !== 'active') continue;
    for (const id in c.positions) {
      const sec = s.securities[id];
      const q = c.positions[id];
      const mv = q * sec.price * (sec.multiplier ?? 1);
      rows[id] ??= { id, long: 0, short: 0, internal: 0, external: 0, shortfall: 0, fee: sec.borrowFeeBps, tier: sec.kind === 'future' ? 'Futures' : borrowTier(sec) };
      if (q > 0) rows[id].long += mv;
      else rows[id].short -= mv;
    }
  }
  for (const id in rows) {
    const p = s.securities[id].price;
    rows[id].internal = (s.alloc.internalCover[id] ?? 0) * p;
    rows[id].external = s.borrows.filter((b) => b.secId === id).reduce((a, b) => a + b.qty * p, 0);
    rows[id].shortfall = (s.alloc.shortfall[id] ?? 0) * p;
  }
  return Object.values(rows);
}

export function BookScreen() {
  const g = useGame();
  const s = g.s!;
  const nav = useNav();
  const [filter, setFilter] = useState<'all' | 'shorts' | 'htb'>('all');
  const rows = useMemo(() => bookRows(s), [g.v]);
  const tot = rows.reduce((a, r) => ({ long: a.long + r.long, short: a.short + r.short, internal: a.internal + r.internal, external: a.external + r.external }), { long: 0, short: 0, internal: 0, external: 0 });
  const shown = rows
    .filter((r) => (filter === 'all' ? true : filter === 'shorts' ? r.short > 0 : r.tier === 'HTB' || r.tier === 'Warm'))
    .sort((a, b) => b.long + b.short - (a.long + a.short));
  const intRate = tot.short > 0 ? tot.internal / tot.short : 0;
  // value of internalisation vs external sourcing of the same shares:
  // external = post 102% collateral (funded by the proceeds + 2% wholesale) earning SOFR − fee;
  // internal = keep the proceeds, saving FTP. Difference ≈ 1.02 × MV × (FTP spread + lender fee).
  const perDollar = (id: string) => (COLLATERAL_MARGIN * (s.market.ftpSpreadBps + s.securities[id].borrowFeeBps)) / 1e4;
  let saved = 0;
  for (const r of rows) saved += r.internal * perDollar(r.id);
  return (
    <Screen title="Book" subtitle="Client positions, borrow and inventory">
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Client longs" value={fm(tot.long)} sub="customer property, in custody" />
        <Metric label="Client shorts" value={fm(tot.short)} sub={`${fm(tot.external)} borrowed externally`} />
      </Row>
      <Row gap={10} style={{ marginTop: 10 }}>
        <Metric
          label="Internalised"
          value={fpct(intRate, 0)}
          sub={`${fm(tot.internal)} of shorts`}
          tone={C.accent}
          calc={() =>
            calc('Internalisation rate', intRate, {
              fmt: 'pct',
              formula: 'shorts covered by rehypothecated client longs ÷ total client shorts',
              note: 'Internal cover avoids lender fees and the 102% cash collateral; the short proceeds instead fund other clients\' debit balances (within the reserve formula).',
              children: [calc('Shorts covered internally', tot.internal), calc('Shorts covered by lender borrows', tot.external), calc('Uncovered (fails → buy-ins)', rows.reduce((a, r) => a + r.shortfall, 0))],
            })
          }
        />
        <Metric
          label="Internalisation value"
          value={fm(saved)}
          sub="per year vs borrowing externally"
          tone={C.up}
          calc={() =>
            calc('Annual value of internalised borrow', saved, {
              formula: 'Σ internal cover × 1.02 × (treasury FTP spread + lender fee)',
              note: 'Externally, the short proceeds go to the lender as 102% collateral earning SOFR − fee, and the extra 2% is funded at FTP. Internally, the proceeds stay and replace FTP funding. Ignores any reserve-formula lock-up.',
              children: rows.filter((r) => r.internal > 0).map((r) => calc(`${r.id}: ${fm(r.internal)} × 1.02 × (${Math.round(s.market.ftpSpreadBps)} + ${s.securities[r.id].borrowFeeBps})bp`, r.internal * perDollar(r.id))),
            })
          }
        />
      </Row>
      <View style={{ marginTop: S.lg }}>
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'shorts', label: 'Shorts' }, { id: 'htb', label: 'Warm / HTB' }]} />
      </View>
      <View style={{ gap: 8, marginTop: 10 }}>
        {shown.map((r) => {
          const sec = s.securities[r.id];
          const covered = r.short > 0 ? r.internal / r.short : 0;
          return (
            <Card key={r.id} onPress={() => nav.push({ name: 'security', id: r.id })} style={{ padding: S.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={8}>
                  <T v="h3">{r.id}</T>
                  <Pill text={r.tier} color={r.tier === 'HTB' ? C.down : r.tier === 'Warm' ? C.warn : C.textDim} />
                  {sec.squeeze > 0.1 ? <Pill text="Squeeze" color={C.down} filled /> : null}
                </Row>
                <T v="num" color={signColor(sec.price / sec.prevPrice - 1)}>{((sec.price / sec.prevPrice - 1) * 100).toFixed(1)}%</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <T v="caption">Long {fm(r.long)} · Short {fm(r.short)}</T>
                {sec.kind !== 'future' && r.short > 0 ? <T v="caption">fee {sec.borrowFeeBps}bp</T> : null}
              </Row>
              {r.short > 0 && sec.kind !== 'future' ? (
                <View style={{ marginTop: 6, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: C.surface3 }}>
                  <View style={{ flex: Math.max(0.0001, r.internal), backgroundColor: C.accent }} />
                  <View style={{ flex: Math.max(0.0001, r.external), backgroundColor: C.info }} />
                  <View style={{ flex: Math.max(0.0001, r.shortfall), backgroundColor: C.down }} />
                </View>
              ) : null}
              {r.short > 0 && sec.kind !== 'future' ? <T v="caption" style={{ marginTop: 4 }}>{fpct(covered, 0)} internal · {fm(r.external)} external{r.shortfall > 0 ? ` · ${fm(r.shortfall)} uncovered` : ''}</T> : null}
            </Card>
          );
        })}
      </View>
      <Section title="External borrow contracts">
        <Card>
          {s.borrows.length === 0 ? <T v="small">None.</T> : null}
          {[...s.borrows]
            .sort((a, b) => b.qty * s.securities[b.secId].price - a.qty * s.securities[a.secId].price)
            .map((b) => (
              <KV key={b.id} k={`${b.secId} · ${s.lenders[b.lenderId].name}`} v={fm(b.qty * s.securities[b.secId].price)} sub={`${b.feeBps}bp · since day ${b.openedDay} · collateral ${fm(b.qty * s.securities[b.secId].price * COLLATERAL_MARGIN)}`} />
            ))}
        </Card>
      </Section>
    </Screen>
  );
}

export function SecurityDetail({ id }: { id: string }) {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  const sec = s.securities[id];
  const holders = Object.values(s.clients).filter((c) => c.status === 'active' && c.positions[id]);
  const longs = holders.filter((c) => c.positions[id] > 0);
  const shorts = holders.filter((c) => c.positions[id] < 0);
  const intSup = internalSupply(s, id);
  const ext = externalSupply(s, id);
  const internalCover = (s.alloc.internalCover[id] ?? 0) * sec.price;
  const external = s.borrows.filter((b) => b.secId === id).reduce((a, b) => a + b.qty * sec.price, 0);
  const shortTotal = shorts.reduce((a, c) => a - c.positions[id] * sec.price, 0);
  return (
    <Screen back title={`${sec.ticker} · ${sec.name}`} subtitle={`${sec.sector} · ${sec.kind}`}>
      <Card style={{ marginTop: S.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="numXl">{sec.price.toFixed(2)}</T>
            <T v="num" color={signColor(sec.price / sec.prevPrice - 1)}>{((sec.price / sec.prevPrice - 1) * 100).toFixed(2)}% today</T>
          </View>
          <Sparkline data={sec.hist.slice(-60)} width={150} height={56} color={sec.hist[sec.hist.length - 1] >= sec.hist[0] ? C.up : C.down} />
        </Row>
      </Card>
      {sec.kind !== 'future' ? (
        <Row gap={10} style={{ marginTop: 10 }}>
          <Metric label="Borrow fee" value={`${sec.borrowFeeBps}bp`} tone={sec.borrowFeeBps > 300 ? C.down : sec.borrowFeeBps > 50 ? C.warn : C.text} sub={borrowTier(sec)} />
          <Metric label="Utilisation" value={fpct(utilisation(s, id), 0)} sub={`ADV ${fm(sec.adv)}`} />
        </Row>
      ) : null}
      {shortTotal > 0 ? (
        <Section title="How the shorts are covered">
          <Card>
            <FlowDiagram
              width={w - 2 * S.lg}
              height={220}
              nodes={[
                { id: 'longs', label: longs[0] ? longs.map((c) => c.short).slice(0, 2).join('/') : 'No longs', sub: 'rehyp longs', x: 0, y: 0 },
                { id: 'atlas', label: 'Atlas PB', x: 0.5, y: 0.5 },
                { id: 'shorts', label: shorts.map((c) => c.short).slice(0, 2).join('/'), sub: 'short sellers', x: 1, y: 0 },
                { id: 'lenders', label: 'Lenders', sub: `${s.borrows.filter((b) => b.secId === id).length} contracts`, x: 1, y: 1 },
                { id: 'funding', label: 'Debit funding', sub: 'long clients', x: 0, y: 1 },
              ]}
              edges={[
                ...(internalCover > 0 ? [{ from: 'longs', to: 'atlas', kind: 'sec' as const, label: `${fm(internalCover)} rehyp` }] : []),
                { from: 'atlas', to: 'shorts', kind: 'sec', label: `${fm(shortTotal)} delivered` },
                ...(external > 0 ? [{ from: 'lenders', to: 'atlas', kind: 'sec' as const, label: `${fm(external)} borrowed` }, { from: 'atlas', to: 'lenders', kind: 'cash' as const, label: `${fm(external * 1.02)} collateral` }] : []),
                ...(internalCover > 0 ? [{ from: 'atlas', to: 'funding', kind: 'cash' as const, label: `${fm(internalCover)} proceeds` }] : []),
              ]}
            />
          </Card>
        </Section>
      ) : null}
      {holders.length ? (
        <Section title="Atlas clients">
          <Card>
            {holders.map((c) => {
              const q = c.positions[id];
              return <KV key={c.id} k={`${c.short} ${q > 0 ? 'long' : 'short'}`} v={fm(Math.abs(q) * sec.price * (sec.multiplier ?? 1))} sub={q < 0 && sec.kind !== 'future' ? `pays ${clientFee(s, c, id)}bp · rebate ${((s.market.sofr - clientFee(s, c, id) / 1e4) * 100).toFixed(2)}%` : undefined} tone={q > 0 ? C.text : C.down} />;
            })}
          </Card>
        </Section>
      ) : null}
      {sec.kind !== 'future' ? (
        <Section title="Supply available to Atlas today">
          <Card>
            {intSup.filter((r) => r.units > 0).map((r, i) => (
              <KV key={i} k={r.source === 'rehyp' ? `Internal: ${s.clients[r.clientId!].short} (rehyp)` : 'Atlas AM programme'} v={fm(r.value)} sub={r.note} />
            ))}
            {ext.map((l) => (
              <KV key={l.lenderId} k={l.name} v={fm(l.units * sec.price)} sub={`${lenderFee(s, l.lenderId, id)}bp · recall risk ${l.recall > 1.2 ? 'high' : l.recall < 0.6 ? 'low' : 'medium'}`} />
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
