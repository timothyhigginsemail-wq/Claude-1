import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { capitalExplainDesk, deskSummary, PNL_KEYS, PNL_LABEL, runRateExplain } from '../../engine/analytics';
import { calc } from '../../engine/explain';
import { fmtDate } from '../../engine/calendar';
import { fm, fmSigned, fpct, fx } from '../../engine/format';
import { liquidityMetrics } from '../../engine/funding';
import { REGIMES } from '../../engine/market';
import { HURDLE } from '../../engine/risk';
import type { DayReport, GameEvent } from '../../engine/types';
import { CAMPAIGN_DAYS, PHASES, pendingBlocking } from '../../game/day';
import { computeScore } from '../../game/scoring';
import { Sparkline } from '../components/charts';
import { Screen } from '../components/Screen';
import { Bar, Btn, Card, Divider, Metric, Pill, Row, Section, Sheet, T } from '../components/ui';
import { useGame } from '../GameContext';
import { C, S, signColor } from '../theme';
import { EventSheet, KIND_META } from './EventSheet';

function regimeColor(r: string) {
  return r === 'crisis' ? C.down : r === 'stressed' ? C.warn : r === 'bull' || r === 'recovery' ? C.up : C.textDim;
}

export function DeskScreen({ onSettings }: { onSettings: () => void }) {
  const g = useGame();
  const s = g.s!;
  const [open, setOpen] = useState<GameEvent | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const d = useMemo(() => deskSummary(s), [g.v]);
  const lm = useMemo(() => liquidityMetrics(s), [g.v]);
  const m = s.market;
  const pending = s.events.filter((e) => e.status === 'pending');
  const blocking = pendingBlocking(s);
  const phase = PHASES[s.phase - 1];
  const idx = m.indexHist.slice(-40);

  return (
    <Screen
      title="Atlas Prime Services"
      subtitle={`${fmtDate(s.date)} · Day ${s.day}${s.day <= CAMPAIGN_DAYS ? ` of ${CAMPAIGN_DAYS}` : ''} · ${phase.name}`}
      right={
        <Pressable onPress={onSettings} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={C.textDim} />
        </Pressable>
      }
    >
      {/* market strip */}
      <Card style={{ marginTop: S.md, padding: S.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Row gap={8}>
              <Pill text={REGIMES[m.regime].label} color={regimeColor(m.regime)} filled />
              <T v="caption">Vol {m.vol.toFixed(0)}</T>
            </Row>
            <Row gap={8} style={{ marginTop: 8 }}>
              <T v="numLg">{m.index.toFixed(1)}</T>
              <T v="num" color={signColor(m.lastReturn)}>{m.lastReturn >= 0 ? '+' : ''}{(m.lastReturn * 100).toFixed(2)}%</T>
            </Row>
            <T v="caption">US500 index ETF</T>
          </View>
          <Sparkline data={idx} width={130} height={46} color={idx[idx.length - 1] >= idx[0] ? C.up : C.down} />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="caption">SOFR</T>
            <T v="num">{fpct(m.sofr, 2)}</T>
          </View>
          <View>
            <T v="caption">Repo (equity, A)</T>
            <T v="num" color={m.repoStressBps > 25 ? C.warn : C.text}>S+{Math.round(25 + m.repoStressBps)}bp</T>
          </View>
          <View>
            <T v="caption">Treasury FTP</T>
            <T v="num">S+{Math.round(m.ftpSpreadBps)}bp</T>
          </View>
          <View>
            <T v="caption">Haircuts</T>
            <T v="num" color={m.haircutMult > 1.15 ? C.warn : C.text}>{fx(m.haircutMult, 2)}</T>
          </View>
        </Row>
      </Card>

      <Row gap={10} style={{ marginTop: 10 }}>
        <Metric label="Revenue run-rate" value={fm(d.revenueRunRate)} tone={signColor(d.revenueRunRate)} calc={() => runRateExplain(s)} sub="annualised, today's book" />
        <Metric
          label="Economic profit"
          value={fm(d.economicProfitRunRate)}
          tone={signColor(d.economicProfitRunRate)}
          sub={`RoAC ${fpct(d.roac)} vs ${fpct(HURDLE, 0)} hurdle`}
          calc={() =>
            calc('Desk economic profit (annual run-rate)', d.economicProfitRunRate, {
              formula: 'Net revenue − expected credit loss − 12% × capital used',
              children: [runRateExplain(s), calc('Expected credit loss', -d.expectedLoss), calc('Cost of capital', -HURDLE * d.capitalUsed, { children: [capitalExplainDesk(s)] }), calc('Return on allocated capital', d.roac, { fmt: 'pct' })],
            })
          }
        />
      </Row>
      <Row gap={10} style={{ marginTop: 10 }}>
        <Metric label="Capital used" value={fpct(d.capitalUtil, 0)} tone={d.capitalUtil > 1 ? C.down : d.capitalUtil > 0.85 ? C.warn : C.text} sub={`${fm(d.capitalUsed)} of ${fm(d.allocated)}`} calc={() => capitalExplainDesk(s)} />
        <Metric label="Liquidity coverage" value={fx(lm.lcr, 2)} tone={lm.lcr < 1 ? C.down : lm.lcr < 1.3 ? C.warn : C.up} sub={`${fm(lm.sources)} vs ${fm(lm.stressedOutflows)} outflows`} calc={() => lm.lines} />
      </Row>

      <Card style={{ marginTop: 10, padding: S.md }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <T v="label">Management confidence</T>
          <T v="num" color={s.desk.confidence < 30 ? C.down : s.desk.confidence < 50 ? C.warn : C.up}>{Math.round(s.desk.confidence)}/100</T>
        </Row>
        <Bar value={s.desk.confidence} max={100} color={s.desk.confidence < 30 ? C.down : s.desk.confidence < 50 ? C.warn : C.accent} />
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <T v="caption">Franchise score {computeScore(s).total.toFixed(0)}</T>
          <T v="caption">Cumulative EP {fmSigned(s.cumEP)}</T>
        </Row>
      </Card>

      <Section title={`Today · ${pending.length} open`} right={<T v="caption">{s.desk.analystCapacity - s.desk.analystUsed} analyst slot{s.desk.analystCapacity - s.desk.analystUsed === 1 ? '' : 's'}</T>}>
        {s.events.length === 0 ? (
          <Card>
            <T v="small">A quiet morning. Review client economics, funding and risk — then close the day.</T>
          </Card>
        ) : null}
        <View style={{ gap: 8 }}>
          {s.events.map((ev) => {
            const meta = KIND_META[ev.kind] ?? KIND_META.info;
            const done = ev.status !== 'pending';
            const c = ev.clientId ? s.clients[ev.clientId] : undefined;
            return (
              <Card key={ev.id} onPress={() => setOpen(ev)} accent={done ? C.border : ev.urgent ? C.down : meta.color} style={{ padding: S.md, opacity: done ? 0.6 : 1 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={6}>
                    <T v="caption" style={{ fontWeight: '700', color: C.textDim }}>{ev.time}</T>
                    <Ionicons name={meta.icon} size={13} color={meta.color} />
                    <T v="caption" color={meta.color}>{meta.label.toUpperCase()}</T>
                    {c ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.color }} /> : null}
                  </Row>
                  {done ? <Ionicons name="checkmark-circle" size={16} color={C.up} /> : ev.urgent ? <Pill text="Urgent" color={C.down} /> : <Ionicons name="chevron-forward" size={15} color={C.textFaint} />}
                </Row>
                <T v="h3" style={{ marginTop: 5 }}>{ev.title}</T>
                <T v="small" numberOfLines={done ? 2 : 2} style={{ marginTop: 3 }}>{done ? ev.resolution : ev.body}</T>
              </Card>
            );
          })}
        </View>
      </Section>

      <View style={{ marginTop: S.xl }}>
        {blocking.length ? <T v="small" color={C.down} style={{ marginBottom: 8, textAlign: 'center' }}>A defaulted client needs your decision before the close.</T> : null}
        <Btn
          title={pending.length && !blocking.length ? `Close the day (${pending.length} unanswered → defaults)` : 'Close the day'}
          tone="primary"
          icon="moon-outline"
          disabled={blocking.length > 0 || s.status !== 'playing'}
          onPress={() => {
            const r = g.closeDay();
            if (r) setReport(r);
          }}
        />
      </View>

      <Section title="Morning briefing">
        <Card>
          {m.headlines.map((h, i) => (
            <Row key={i} gap={8} style={{ paddingVertical: 4, alignItems: 'flex-start' }}>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent, marginTop: 8 }} />
              <T v="small" color={C.text} style={{ flex: 1 }}>{h}</T>
            </Row>
          ))}
          {s.lastReport?.notes.length ? <Divider /> : null}
          {s.lastReport?.notes.slice(0, 5).map((n, i) => (
            <T key={i} v="small" color={n.tone === 'bad' ? C.down : n.tone === 'good' ? C.up : C.textDim} style={{ paddingVertical: 2 }}>{n.text}</T>
          ))}
        </Card>
      </Section>

      <Section title={`Phase ${s.phase}: ${phase.name}`}>
        <Card>
          <T v="small">{phase.blurb}</T>
          <Row gap={4} style={{ marginTop: 10 }}>
            {PHASES.map((p, i) => (
              <View key={p.name} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < s.phase ? C.accent : C.surface3 }} />
            ))}
          </Row>
        </Card>
      </Section>

      <EventSheet ev={open} onClose={() => setOpen(null)} />
      <DayReportSheet report={report} onClose={() => setReport(null)} />
    </Screen>
  );
}

export function DayReportSheet({ report, onClose }: { report: DayReport | null; onClose: () => void }) {
  const g = useGame();
  const s = g.s;
  if (!report || !s) return null;
  const rows = PNL_KEYS.map((k) => ({ k, v: report.pnl[k] })).filter((r) => Math.abs(r.v) > 1);
  return (
    <Sheet visible={!!report} onClose={onClose} title={`Close · Day ${report.day}`} footer={<Btn title={s.status === 'fired' ? 'See what happened' : `Open day ${s.day}`} tone="primary" onPress={onClose} />}>
      <T v="caption">{fmtDate(report.date)}</T>
      <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <View>
          <T v="label">Net income</T>
          <T v="numXl" color={signColor(report.netIncome)}>{fmSigned(report.netIncome)}</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="label">Economic profit</T>
          <T v="numLg" color={signColor(report.economicProfit)}>{fmSigned(report.economicProfit)}</T>
          <T v="caption">after cost of capital</T>
        </View>
      </Row>
      <Card style={{ marginTop: S.md, padding: S.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small">Market</T>
          <T v="num" color={signColor(report.marketReturn)}>{(report.marketReturn * 100).toFixed(2)}% · {REGIMES[report.regime].label}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <T v="small">Management confidence</T>
          <T v="num" color={signColor(report.confidenceDelta)}>{report.confidenceDelta >= 0 ? '+' : ''}{report.confidenceDelta.toFixed(1)}</T>
        </Row>
      </Card>
      <Section title="P&L by line">
        <Card style={{ padding: S.md }}>
          {rows.map((r) => (
            <Row key={r.k} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
              <T v="small" style={{ flex: 1 }}>{PNL_LABEL[r.k]}</T>
              <T v="num" color={signColor(r.v)}>{fmSigned(r.v)}</T>
            </Row>
          ))}
        </Card>
      </Section>
      {report.notes.length ? (
        <Section title="What happened">
          <Card style={{ padding: S.md, gap: 6 }}>
            {report.notes.map((n, i) => (
              <T key={i} v="small" color={n.tone === 'bad' ? C.down : n.tone === 'good' ? C.up : C.text}>{n.text}</T>
            ))}
          </Card>
        </Section>
      ) : null}
      <Section title="Headlines">
        <Card style={{ padding: S.md, gap: 4 }}>
          {report.headlines.map((h, i) => (
            <T key={i} v="small" color={C.text}>{h}</T>
          ))}
        </Card>
      </Section>
    </Sheet>
  );
}
