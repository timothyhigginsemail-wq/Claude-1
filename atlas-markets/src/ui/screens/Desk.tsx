import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calc } from '../../engine/explain';
import { fm, fmSigned, fpct } from '../../engine/format';
import { REGIMES } from '../../engine/market';
import type { DayReport, DeskId, GameState } from '../../engine/types';
import { pnlSum } from '../../engine/book';
import { CAMPAIGN_DAYS, totalPnlToday } from '../../game/day';
import { CLOSE_MIN, clockLabel } from '../../game/live';
import { minuteOf } from '../../engine/intraday';
import { explainEP, explainParts, PART_LABEL } from '../../game/explainers';
import { allocated } from '../../game/manage';
import { DESK_META } from '../../game/setup';
import { Waterfall } from '../components/charts';
import { LearnLink } from '../components/Learn';
import { Screen, useContentWidth } from '../components/Screen';
import { Bar, Btn, Card, KV, Metric, Pill, Row, Section, Sheet, T } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { DESKS, useRisk } from '../useRisk';

const REGIME_DESC: Record<string, string> = {
  calm: 'Low volatility, tight spreads, plenty of dealer balance sheet. Flow is thin-margin but safe.',
  steady: 'Normal markets. Data releases move prices; liquidity is reliable.',
  choppy: 'Higher volatility and wider spreads. Inventory is riskier to hold overnight.',
  recovery: 'Volatility falling from stressed levels; risk appetite returning, spreads still wide.',
  stressed: 'Risk-off: volatility up, liquidity thinning, correlations rising. Clients pay for dealers who stay in.',
  crisis: 'Liquidity has collapsed. Spreads gap, correlations go to one, counterparties fail. Survive first.',
};

export function regimeColor(r: GameState['market']['regime']) {
  return r === 'crisis' ? C.down : r === 'stressed' ? C.warn : r === 'choppy' ? C.info : C.up;
}

export function DeskScreen({ onSettings }: { onSettings: () => void }) {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const risk = useRisk()!;
  const w = useContentWidth();
  const [outcome, setOutcome] = useState<string | null>(null);
  const m = s.market;
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked);
  const today = totalPnlToday(s);
  const varLimit = unlocked.reduce((a, d) => a + s.desks[d].limits.var, 0);
  const openRfqs = s.rfqs.filter((r) => r.status === 'open' && r.arrived);
  const pending = s.rfqs.filter((r) => r.status === 'open').length;
  const decisions = s.decisions.filter((d) => d.status === 'open');
  const events = s.events.filter((e) => e.day === s.day);
  const upcoming = s.events.filter((e) => e.day > s.day && e.day <= s.day + 3);
  const reg = REGIMES[m.regime];
  const campaign = s.day <= CAMPAIGN_DAYS ? `Day ${s.day} of ${CAMPAIGN_DAYS}` : `Career · day ${s.day}`;

  return (
    <Screen
      title="Global Markets"
      subtitle={`${campaign} · ${s.date} · ${clockLabel(s.clock)}`}
      right={
        <Row gap={14}>
          <Pressable onPress={() => nav.push({ name: 'manage' })} hitSlop={10}>
            <Ionicons name="options-outline" size={22} color={C.textDim} />
          </Pressable>
          <Pressable onPress={onSettings} hitSlop={10}>
            <Ionicons name="settings-outline" size={21} color={C.textDim} />
          </Pressable>
        </Row>
      }
    >
      {s.clock === 0 && !g.speed ? (
        <Card style={{ marginTop: S.md }} accent={C.accent}>
          <T v="h3">The market opens at 07:00</T>
          <T v="small" style={{ marginTop: 4 }}>Read the briefing, then press 1× on the clock bar at the bottom. Prices start moving, data is released at its scheduled time, and clients call in through the day. Each request lapses after 30 market minutes. Pause whenever you like.</T>
        </Card>
      ) : null}
      {s.news.length ? (
        <Card style={{ marginTop: S.md }} accent={C.warn}>
          <T v="label" style={{ marginBottom: 4 }}>Newswire</T>
          {[...s.news].reverse().slice(0, 5).map((n, i) => (
            <Row key={i} gap={8} style={{ alignItems: 'flex-start', paddingVertical: 3 }}>
              <T v="caption" style={{ width: 38 }}>{clockLabel(n.minute)}</T>
              <T v="small" color={n.tone === 'bad' ? C.warn : C.text} style={{ flex: 1 }}>{n.text}</T>
            </Row>
          ))}
        </Card>
      ) : null}
      <Card style={{ marginTop: S.md }} accent={regimeColor(m.regime)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="label">Market regime</T>
          <Pill text={reg.label} color={regimeColor(m.regime)} filled />
        </Row>
        <T v="small" style={{ marginTop: 6 }}>{REGIME_DESC[m.regime]}</T>
        <Row gap={14} style={{ marginTop: 8 }}>
          <T v="caption">Spreads ×{m.liquidity.toFixed(2)}</T>
          <T v="caption">Implied vol {(m.eq.atmVol.US500 * 100).toFixed(1)}</T>
          <T v="caption">Dealer appetite ×{m.dealerAppetite.toFixed(2)}</T>
        </Row>
      </Card>

      <Row gap={8} style={{ marginTop: S.md }}>
        <Metric
          label="P&L today"
          value={fmSigned(today)}
          tone={signColor(today)}
          sub={s.clock >= CLOSE_MIN ? 'at 16:00, before the close' : 'live, marked to market'}
          calc={() => {
            const booked = unlocked.map((d) => explainParts(DESK_META[d].name, s.desks[d].pnlToday));
            const sum = booked.reduce((a, c) => a + c.value, 0);
            return calc('P&L today (live)', today, {
              formula: 'Σ desks (value now − value at the open)',
              note: 'Spread captured and execution costs book when you trade; market moves are marked continuously. Electronic flow, carry, funding and the overnight move land at the close.',
              children: [...booked, calc('Market move since your last trade (not yet split by factor)', today - sum)],
            });
          }}
        />
        <Metric label="Cumulative P&L" value={fmSigned(s.stats.cumPnl)} tone={signColor(s.stats.cumPnl)} sub={`EP ${fmSigned(s.cumEP)}`} calc={() => explainEP(s)} />
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <Metric
          label="Firm VaR (99%)"
          value={fm(risk.v.var99)}
          tone={risk.v.var99 > varLimit ? C.down : undefined}
          sub={`limit ${fm(varLimit)} · ${fpct(risk.v.var99 / Math.max(1, varLimit), 0)}`}
          calc={() =>
            calc('Firm 1-day 99% VaR', risk.v.var99, {
              formula: '1st percentile of 300 simulated one-day P&Ls (full revaluation)',
              children: [calc('Sum of desk VaRs (undiversified)', risk.v.undiversified), calc('Diversification benefit', risk.v.var99 - risk.v.undiversified), calc('Expected shortfall (97.5%)', risk.v.es975)],
            })
          }
        />
        <Metric
          label="Confidence"
          value={`${Math.round(s.confidence)}`}
          tone={s.confidence < 30 ? C.down : s.confidence < 45 ? C.warn : C.up}
          sub={`reputation ${Math.round(s.reputation)}`}
          calc={() =>
            calc('Management confidence', s.confidence, {
              fmt: 'num',
              note: 'Moves with your rolling 5-day economic profit versus a 5% target return, limit breaches, client franchise and big losses. It drifts back toward 55. At 0 you are replaced.',
            })
          }
        />
      </Row>

      {outcome ? (
        <Card style={{ marginTop: S.md }} accent={C.accent}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <T v="small" color={C.text} style={{ flex: 1 }}>{outcome}</T>
            <Pressable onPress={() => setOutcome(null)} hitSlop={10}>
              <Ionicons name="close" size={16} color={C.textDim} />
            </Pressable>
          </Row>
        </Card>
      ) : null}

      {decisions.length ? (
        <Section title={`Decisions · ${decisions.length}`}>
          {decisions.map((d) => (
            <Card key={d.id} style={{ marginBottom: 8 }} accent={C.warn}>
              <T v="h3">{d.title}</T>
              <T v="small" style={{ marginTop: 6 }}>{d.body}</T>
              <View style={{ marginTop: 10, gap: 8 }}>
                {d.options.map((o) => (
                  <Pressable key={o.id} onPress={() => setOutcome(g.decide(d.id, o.id))} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, backgroundColor: o.tone === 'primary' ? C.accent + '1A' : C.surface2, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: o.tone === 'primary' ? C.accent + '66' : C.border })}>
                    <T v="h3" color={o.tone === 'primary' ? C.accent : C.text} style={{ fontSize: 14 }}>{o.label}</T>
                    {o.detail ? <T v="caption" style={{ marginTop: 2 }}>{o.detail}</T> : null}
                  </Pressable>
                ))}
              </View>
              {d.kind === 'launch' ? <LearnLink topic={d.data.desk === 'credit' ? 'credit' : d.data.desk === 'cmdty' ? 'commodities' : 'exotics'} /> : d.kind === 'review' ? <LearnLink topic="capital" /> : null}
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Morning briefing">
        <Card>
          {s.lastReport ? (
            <>
              <T v="label" style={{ marginBottom: 6 }}>Yesterday's moves</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {s.lastReport.moves.map((mv) => (
                  <View key={mv.label} style={{ width: '33.3%', paddingVertical: 4 }}>
                    <T v="caption">{mv.label}</T>
                    <T v="num" color={mv.tone === 'up' ? C.up : C.down} style={{ fontSize: 13 }}>{mv.value}</T>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <T v="small">First day. The book is flat; clients are waiting to see whether Atlas will make prices. Start in Trading — and keep an eye on what you are accumulating.</T>
          )}
          <T v="label" style={{ marginTop: 12, marginBottom: 4 }}>Today</T>
          {events.length ? (
            events.map((e) => (
              <Row key={e.id} gap={8} style={{ paddingVertical: 4 }}>
                <T v="caption" style={{ width: 40 }}>{e.time}</T>
                <T v="small" color={C.text} style={{ flex: 1 }}>{e.title}</T>
                <T v="caption" color={s.clock >= minuteOf(e.time) && e.outcome ? C.warn : undefined}>{s.clock >= minuteOf(e.time) && e.outcome ? e.outcome : e.consensus}</T>
              </Row>
            ))
          ) : (
            <T v="small">No scheduled data.</T>
          )}
          {upcoming.length ? (
            <>
              <T v="label" style={{ marginTop: 12, marginBottom: 4 }}>Next 3 days</T>
              {upcoming.map((e) => (
                <Row key={e.id} gap={8} style={{ paddingVertical: 3 }}>
                  <T v="caption" style={{ width: 40 }}>D{e.day}</T>
                  <T v="caption" color={C.textDim} style={{ flex: 1 }}>{e.title}</T>
                </Row>
              ))}
            </>
          ) : null}
        </Card>
      </Section>

      <Section title="Client inquiries">
        <Card onPress={() => nav.setTab('trading')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="numLg">{openRfqs.length} open RFQs</T>
              <T v="caption">{fm(openRfqs.reduce((a, r) => a + r.notional, 0))} notional · {s.rfqs.filter((r) => r.status === 'won').length} won today · {pending - openRfqs.length} still to come</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
          </Row>
        </Card>
      </Section>

      <Section title="Desks">
        <Card style={{ gap: 12 }}>
          {DESKS.map((d) => {
            const desk = s.desks[d];
            if (!desk.unlocked)
              return (
                <Row key={d} style={{ justifyContent: 'space-between' }}>
                  <T v="small" color={C.textFaint}>{DESK_META[d].name}</T>
                  <Pill text={s.day >= DESK_META[d].unlockDay ? 'available' : `day ${DESK_META[d].unlockDay}`} color={C.textFaint} />
                </Row>
              );
            const vr = risk.v.byDesk[d].var99;
            const util = vr / Math.max(1, desk.limits.var);
            const pnl = s.desks[d] ? pnlSum(desk.pnlToday) : 0;
            return (
              <Pressable key={d} onPress={() => nav.setTab('risk')}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={6} style={{ flex: 1 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DESK_META[d].color }} />
                    <T v="h3" style={{ fontSize: 14 }}>{desk.name}</T>
                    {desk.restrictedUntil > s.day ? <Pill text="restricted" color={C.down} /> : desk.breachDays > 0 ? <Pill text="breach" color={C.warn} /> : null}
                  </Row>
                  <T v="num" color={signColor(pnl)}>{fmSigned(pnl)}</T>
                </Row>
                <Row gap={8} style={{ marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Bar value={vr} max={desk.limits.var * 1.25} marker={desk.limits.var} color={util > 1 ? C.down : util > 0.8 ? C.warn : DESK_META[d].color} />
                  </View>
                  <T v="caption" style={{ width: 110, textAlign: 'right' }}>VaR {fm(vr)} / {fm(desk.limits.var)}</T>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      </Section>

      {s.opportunities.length ? (
        <Section title="Desk ideas">
          {s.opportunities.map((o) => (
            <Card key={o.id} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="h3" style={{ fontSize: 14, flex: 1 }}>{o.title}</T>
                <Pill text={DESK_META[o.desk].short} color={DESK_META[o.desk].color} />
              </Row>
              <T v="small" style={{ marginTop: 4 }}>{o.body}</T>
            </Card>
          ))}
        </Section>
      ) : null}

      <View style={{ marginTop: S.xl }}>
        {openRfqs.length ? <T v="caption" center style={{ marginBottom: 8 }}>{openRfqs.length} RFQs still open will lapse (clients notice).</T> : null}
        <Btn
          title={s.clock >= CLOSE_MIN ? `Book day ${s.day}` : `Skip to 16:00 and book day ${s.day}`}
          tone="primary"
          icon="moon-outline"
          onPress={() => g.close()}
        />
        <T v="caption" center style={{ marginTop: 8 }}>Electronic flow, working orders, the overnight move, carry and funding are booked at the close. Skipping ahead moves prices to 16:00 without you; clients who haven't called yet won't.</T>
      </View>

    </Screen>
  );
}

export function DayReportSheet({ report, onClose }: { report: DayReport | null; onClose: () => void }) {
  const g = useGame();
  const nav = useNav();
  const w = useContentWidth();
  const s = g.s;
  if (!report || !s) return null;
  const parts = (Object.keys(PART_LABEL) as (keyof typeof report.parts)[]).map((k) => ({ label: PART_LABEL[k], value: report.parts[k] }));
  return (
    <Sheet visible={!!report} onClose={onClose} title={`Day ${report.day} close · ${report.date}`} footer={<Btn title={s.status === 'fired' ? 'See the verdict' : `Start day ${s.day}`} tone="primary" onPress={onClose} />}>
      <T v="label">Trading P&L</T>
      <T v="numXl" color={signColor(report.total)} style={{ marginTop: 4 }}>{fmSigned(report.total)}</T>
      <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
        <Pill
          text={report.ep >= report.total - report.ep ? 'Strong day — well above break-even' : report.ep >= 0 ? 'Beat break-even: value created' : report.total > 0 ? 'Profitable, but below the cost of running the desk' : 'Losing day'}
          color={report.ep >= 0 ? C.up : report.total > 0 ? C.warn : C.down}
          filled
        />
      </View>
      <Row gap={14} style={{ marginTop: 6 }}>
        <T v="small">Economic profit <T v="small" color={signColor(report.ep)}>{fmSigned(report.ep)}</T></T>
        <T v="small">Confidence <T v="small" color={signColor(report.confidenceDelta)}>{report.confidenceDelta >= 0 ? '+' : ''}{report.confidenceDelta.toFixed(1)}</T></T>
      </Row>
      {report.day === CAMPAIGN_DAYS ? (
        <Card style={{ marginTop: S.md }} accent={C.accent}>
          <T v="h3" color={C.accent}>Campaign complete</T>
          <T v="small" style={{ marginTop: 4 }}>30 trading days survived. Cumulative P&L {fmSigned(s.stats.cumPnl)}, economic profit {fmSigned(s.cumEP)}. The game continues in career mode with randomly evolving market regimes.</T>
        </Card>
      ) : null}
      {report.breaches.length ? (
        <Card style={{ marginTop: S.md }} accent={C.down}>
          <T v="label" color={C.down}>Limit breaches</T>
          {report.breaches.map((b, i) => (
            <T key={i} v="small" color={C.text} style={{ marginTop: 4 }}>{b}</T>
          ))}
        </Card>
      ) : null}
      <Section title="Why — P&L attribution">
        <Card>
          <Waterfall items={parts} width={w - 32} total={report.total} totalLabel="Total" />
          <LearnLink topic="attribution" />
        </Card>
      </Section>
      <Section title="By desk">
        <Card>
          {(Object.keys(report.byDesk) as DeskId[]).filter((d) => s.desks[d].unlocked).map((d) => (
            <KV key={d} k={DESK_META[d].name} v={fmSigned(report.byDesk[d])} tone={signColor(report.byDesk[d])} />
          ))}
        </Card>
      </Section>
      <Section title="Markets">
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {report.moves.map((mv) => (
              <View key={mv.label} style={{ width: '33.3%', paddingVertical: 4 }}>
                <T v="caption">{mv.label}</T>
                <T v="num" color={mv.tone === 'up' ? C.up : C.down} style={{ fontSize: 13 }}>{mv.value}</T>
              </View>
            ))}
          </View>
        </Card>
      </Section>
      {report.notes.length ? (
        <Section title="What happened">
          <Card style={{ gap: 8 }}>
            {report.notes.map((n, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: n.tone === 'good' ? C.up : n.tone === 'bad' ? C.down : C.textFaint }} />
                <T v="small" color={C.text} style={{ flex: 1 }}>{n.text}</T>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
      <Btn
        title="Full P&L analysis"
        tone="ghost"
        style={{ marginTop: S.lg }}
        onPress={() => {
          onClose();
          nav.setTab('pnl');
        }}
      />
      <T v="caption" style={{ marginTop: 10 }}>Firm capital {fm(s.firmCapital)} · allocated {fm(allocated(s))}</T>
    </Sheet>
  );
}
