import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { deskSummary, periodFinancingExplain, PNL_KEYS, PNL_LABEL, pnlFromLedger, pnlTotal, runRateExplain } from '../../engine/analytics';
import { calc } from '../../engine/explain';
import { fm, fmSigned, fpct } from '../../engine/format';
import { clientPnlTotal } from '../../engine/funding';
import { computeScore } from '../../game/scoring';
import { BarSeries, Sparkline } from '../components/charts';
import { Screen, useContentWidth } from '../components/Screen';
import { Bar, Card, KV, Metric, Row, Section, Segmented, T, useExplain } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';

export function FinancialsScreen() {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  const nav = useNav();
  const { open } = useExplain();
  const [period, setPeriod] = useState<'today' | 'cum'>('cum');
  const cum = useMemo(() => pnlFromLedger(s), [g.v]);
  const d = useMemo(() => deskSummary(s), [g.v]);
  const score = useMemo(() => computeScore(s), [g.v]);
  const p = period === 'cum' ? cum : s.pnlToday;
  const total = pnlTotal(p);
  const netFin = p.financing + p.creditInterest + p.shortRebate + p.lenderRebate + p.repoInterest + p.treasuryInterest + p.commitmentFee + p.emergencyInterest + p.bufferIncome + p.reserveIncome + p.ccpIncome;
  const hist = s.history;
  const cumEp: number[] = [];
  hist.reduce((a, h) => {
    cumEp.push(a + h.economicProfit);
    return a + h.economicProfit;
  }, 0);
  const allClients = Object.values(s.clients).filter((c) => Math.abs(clientPnlTotal(c.pnl)) > 1 || c.status === 'active');
  return (
    <Screen title="Financials" subtitle={`Since day 1 · ${s.accrualDaysCum} accrual days`}>
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Net income" value={fmSigned(pnlTotal(cum))} tone={signColor(pnlTotal(cum))} sub="since you took over" calc={() => calc('Net income since day 1', pnlTotal(cum), { children: PNL_KEYS.map((k) => calc(PNL_LABEL[k], cum[k])) })} />
        <Metric label="Net financing revenue" value={fmSigned(netFin)} tone={signColor(netFin)} sub={period === 'cum' ? 'interest, rebates, funding' : 'today'} calc={() => periodFinancingExplain(s)} />
      </Row>
      <Row gap={10} style={{ marginTop: 10 }}>
        <Metric label="Cumulative EP" value={fmSigned(s.cumEP)} tone={signColor(s.cumEP)} sub="after 12% cost of capital" />
        <Metric label="Run-rate RoAC" value={fpct(d.roac)} tone={d.roac > 0.12 ? C.up : C.warn} sub={`${fm(d.revenueRunRate)} on ${fm(d.capitalUsed)}`} calc={() => runRateExplain(s)} />
      </Row>

      <Section title="Profit & loss" right={<View style={{ width: 160 }}><Segmented value={period} onChange={setPeriod} options={[{ id: 'today', label: 'Last day' }, { id: 'cum', label: 'Cumulative' }]} /></View>}>
        <Card>
          {PNL_KEYS.map((k) =>
            Math.abs(p[k]) > 1 ? (
              <KV key={k} k={PNL_LABEL[k]} v={fmSigned(p[k])} tone={signColor(p[k])} onPress={k === 'financing' || k === 'shortRebate' || k === 'lenderRebate' || k === 'creditInterest' ? () => open(periodFinancingExplain(s)) : undefined} />
            ) : null,
          )}
          <View style={{ height: 1, backgroundColor: C.border, marginVertical: 6 }} />
          <KV k="Net income" v={fmSigned(total)} tone={signColor(total)} />
          {period === 'cum' ? (
            <>
              <KV k="  of which: central funding residual" v={fmSigned(s.centralCum.residual)} tone={signColor(s.centralCum.residual)} />
              <KV k="  of which: unallocated overhead" v={fmSigned(s.centralCum.overhead)} tone={signColor(s.centralCum.overhead)} />
            </>
          ) : null}
        </Card>
      </Section>

      {hist.length > 1 ? (
        <Section title="Daily net income">
          <Card>
            <BarSeries data={hist.slice(-40).map((h) => h.netIncome)} labels={hist.slice(-40).map((h) => `Day ${h.day}`)} width={w - 2 * S.lg} />
            <T v="label" style={{ marginTop: 14, marginBottom: 6 }}>Cumulative economic profit</T>
            <Sparkline data={cumEp.slice(-60)} width={w - 2 * S.lg} height={56} color={cumEp[cumEp.length - 1] >= 0 ? C.up : C.down} baseline={0} />
            <T v="label" style={{ marginTop: 14, marginBottom: 6 }}>Capital used vs allocated</T>
            <Sparkline data={hist.slice(-60).map((h) => h.capitalUsed)} width={w - 2 * S.lg} height={46} color={C.accent} baseline={s.desk.allocatedCapital} />
          </Card>
        </Section>
      ) : null}

      <Section title="Contribution by client (booked)">
        <Card>
          {allClients
            .sort((a, b) => clientPnlTotal(b.pnl) - clientPnlTotal(a.pnl))
            .map((c) => (
              <KV key={c.id} k={`${c.name}${c.status !== 'active' ? ` (${c.status})` : ''}`} v={fmSigned(clientPnlTotal(c.pnl))} tone={signColor(clientPnlTotal(c.pnl))} onPress={() => nav.push({ name: 'client', id: c.id })} />
            ))}
          <KV k="Central funding residual" v={fmSigned(s.centralCum.residual)} tone={signColor(s.centralCum.residual)} />
          <KV k="Unallocated overhead" v={fmSigned(s.centralCum.overhead)} tone={signColor(s.centralCum.overhead)} />
        </Card>
      </Section>

      <Section title={`Franchise score ${score.total.toFixed(0)}/100`}>
        <Card style={{ gap: 10 }}>
          {score.parts.map((p2) => (
            <View key={p2.key}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" color={C.text}>{p2.label} <T v="caption">({Math.round(p2.weight * 100)}%)</T></T>
                <T v="num">{p2.value.toFixed(0)}</T>
              </Row>
              <View style={{ marginTop: 4 }}>
                <Bar value={p2.value} max={100} color={p2.value < 40 ? C.down : p2.value < 60 ? C.warn : C.accent} height={4} />
              </View>
              <T v="caption" style={{ marginTop: 2 }}>{p2.note}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Records">
        <Card onPress={() => nav.push({ name: 'ledger' })}>
          <T v="h3">Transaction ledger</T>
          <T v="small">Every journal entry with its postings. Each entry balances to zero.</T>
        </Card>
        <Card onPress={() => nav.push({ name: 'log' })} style={{ marginTop: 8 }}>
          <T v="h3">Decision history</T>
          <T v="small">What you decided, and what followed.</T>
        </Card>
      </Section>
    </Screen>
  );
}

export function LedgerScreen() {
  const g = useGame();
  const s = g.s!;
  const [filter, setFilter] = useState<'all' | 'trade' | 'interest' | 'funding' | 'other'>('all');
  const groups: Record<string, string[]> = {
    trade: ['trade', 'fee', 'deposit', 'withdrawal'],
    interest: ['interest', 'rebate'],
    funding: ['funding', 'reserve', 'secborrow', 'collmark', 'ccp', 'capital'],
  };
  const entries = s.ledger.journal
    .filter((e) => (filter === 'all' ? true : filter === 'other' ? !Object.values(groups).flat().includes(e.kind) : groups[filter].includes(e.kind)))
    .slice(-150)
    .reverse();
  const nice = (a: string) => a.replace('desk:', 'Desk ').replace('pnl:', 'P&L ').replace(/^cli:([^:]+):cash$/, (_, id) => `${s.clients[id]?.short ?? id} cash`).replace(/^cli:([^:]+):sp$/, (_, id) => `${s.clients[id]?.short ?? id} short a/c`);
  return (
    <Screen back title="Transaction ledger" subtitle={`${s.ledger.journal.length} recent entries (latest 150 shown)`}>
      <View style={{ marginTop: S.md }}>
        <Segmented value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'trade', label: 'Trades' }, { id: 'interest', label: 'Interest' }, { id: 'funding', label: 'Funding' }, { id: 'other', label: 'Other' }]} />
      </View>
      <T v="caption" style={{ marginTop: 8 }}>Desk perspective, debit-positive: + increases an asset or expense; − increases a liability, equity or income.</T>
      <View style={{ gap: 6, marginTop: 8 }}>
        {entries.map((e) => (
          <Card key={e.id} style={{ padding: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="caption">#{e.id} · day {e.day} · {e.kind}</T>
              {e.clientId ? <T v="caption" color={s.clients[e.clientId]?.color}>{s.clients[e.clientId]?.short}</T> : null}
            </Row>
            <T v="small" color={C.text} style={{ marginTop: 2 }}>{e.memo}</T>
            {e.postings.map((p, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <T v="caption">{nice(p.account)}</T>
                <T v="caption" color={p.amount >= 0 ? C.text : C.textDim} style={{ fontVariant: ['tabular-nums'] }}>{p.amount >= 0 ? '+' : '−'}{fm(Math.abs(p.amount), 3).replace('−', '')}</T>
              </Row>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

export function LogScreen() {
  const g = useGame();
  const s = g.s!;
  const items = [...s.log].reverse();
  return (
    <Screen back title="Decision history" subtitle="Most recent first">
      <View style={{ gap: 6, marginTop: S.md }}>
        {items.map((l, i) => (
          <Card key={i} style={{ padding: 10 }} accent={l.tone === 'bad' ? C.down : l.tone === 'good' ? C.up : C.border}>
            <T v="caption">Day {l.day}</T>
            <T v="small" color={C.text}>{l.text}</T>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
