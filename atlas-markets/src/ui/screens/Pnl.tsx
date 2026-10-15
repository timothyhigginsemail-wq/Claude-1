import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { emptyPnl, pnlSum } from '../../engine/book';
import { calc } from '../../engine/explain';
import { fm, fmSigned, fpct } from '../../engine/format';
import type { PnlParts } from '../../engine/types';
import { ACHIEVEMENTS } from '../../game/achievements';
import { explainEP, explainParts, PART_LABEL } from '../../game/explainers';
import { allocated, dailyCosts, HURDLE } from '../../game/manage';
import { DESK_META } from '../../game/setup';
import { BarSeries, HBars, Sparkline, Waterfall } from '../components/charts';
import { LearnLink } from '../components/Learn';
import { Screen, useContentWidth } from '../components/Screen';
import { Card, KV, Metric, Row, Section, Segmented, T } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';
import { DESKS, useRisk } from '../useRisk';

export function PnlScreen() {
  const g = useGame();
  const nav = useNav();
  const s = g.s!;
  const risk = useRisk()!;
  const w = useContentWidth() - 32;
  const [view, setView] = useState<'last' | 'cum'>('last');
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked);
  const cum = emptyPnl();
  for (const d of DESKS) for (const k of Object.keys(cum) as (keyof PnlParts)[]) cum[k] += s.desks[d].pnl[k];
  const parts = view === 'last' ? s.lastReport?.parts ?? emptyPnl() : cum;
  const total = view === 'last' ? s.lastReport?.total ?? 0 : pnlSum(cum);
  const days = Math.max(1, s.history.length);
  const alloc = allocated(s);
  const roac = alloc > 0 ? ((s.stats.cumPnl - s.costsCum) / alloc) * (252 / days) : 0;
  const franchise = parts.spread + parts.flow;
  return (
    <Screen title="P&L" subtitle={`${s.history.length} closes · economic profit ${fmSigned(s.cumEP)}`} right={
      <Pressable onPress={() => nav.push({ name: 'log' })} hitSlop={10}>
        <Ionicons name="document-text-outline" size={22} color={C.textDim} />
      </Pressable>
    }>
      <Row gap={8} style={{ marginTop: S.md }}>
        <Metric label="Trading P&L" value={fmSigned(s.stats.cumPnl)} tone={signColor(s.stats.cumPnl)} calc={() => explainParts('Cumulative trading P&L', cum)} />
        <Metric label="Economic profit" value={fmSigned(s.cumEP)} tone={signColor(s.cumEP)} calc={() => explainEP(s)} sub="after costs & capital" />
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <Metric
          label="RoAC (annualised)"
          value={fpct(roac, 1)}
          tone={roac > HURDLE ? C.up : C.down}
          sub={`hurdle ${fpct(HURDLE, 0)}`}
          calc={() =>
            calc('Return on allocated capital', roac, {
              fmt: 'pct',
              formula: '(trading P&L − costs) / allocated capital × 252 / days',
              children: [calc('Trading P&L', s.stats.cumPnl), calc('Costs to date', -s.costsCum), calc('Allocated capital', alloc), calc('Trading days', days, { fmt: 'num' })],
            })
          }
        />
        <Metric label="Max drawdown" value={fm(s.stats.maxDrawdown)} tone={s.stats.maxDrawdown > 0 ? C.down : undefined} sub={`peak ${fmSigned(s.stats.peakPnl)}`} />
      </Row>

      {s.history.length ? (
        <Section title="Daily P&L">
          <Card>
            <BarSeries data={s.history.map((h) => h.pnl)} width={w} labels={s.history.map((h) => `Day ${h.day} (${h.regime})`)} />
          </Card>
        </Section>
      ) : (
        <Card style={{ marginTop: S.lg }}>
          <T v="small">Close your first day to see the attribution.</T>
        </Card>
      )}

      <Section title="Attribution">
        <Card>
          <Segmented value={view} options={[{ id: 'last', label: `Last close${s.lastReport ? ` (D${s.lastReport.day})` : ''}` }, { id: 'cum', label: 'Since start' }]} onChange={setView} />
          <View style={{ marginTop: 12 }}>
            <Waterfall items={(Object.keys(PART_LABEL) as (keyof PnlParts)[]).map((k) => ({ label: PART_LABEL[k], value: parts[k] }))} width={w} total={total} totalLabel="Total" />
          </View>
          <Row gap={14} style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <T v="caption">Franchise (spread + flow) <T v="caption" color={signColor(franchise)}>{fm(franchise)}</T></T>
            <T v="caption">Market risk <T v="caption" color={signColor(parts.rates + parts.fx + parts.equity + parts.vol + parts.credit + parts.cmdty)}>{fm(parts.rates + parts.fx + parts.equity + parts.vol + parts.credit + parts.cmdty)}</T></T>
            <T v="caption">Execution <T v="caption" color={signColor(parts.execution)}>{fm(parts.execution)}</T></T>
          </Row>
          <LearnLink topic="attribution" />
        </Card>
      </Section>

      <Section title="By desk (since start)">
        <Card>
          <HBars rows={unlocked.map((d) => ({ label: DESK_META[d].short, value: pnlSum(s.desks[d].pnl), color: DESK_META[d].color, sub: `cap ${fm(risk.cap[d].total)}` }))} width={w} />
          <View style={{ marginTop: 10 }}>
            {unlocked.map((d) => (
              <KV key={d} k={DESK_META[d].name} v={fmSigned(pnlSum(s.desks[d].pnl))} tone={signColor(pnlSum(s.desks[d].pnl))} sub={`spread ${fm(s.desks[d].pnl.spread + s.desks[d].pnl.flow)} · market ${fm(s.desks[d].pnl.rates + s.desks[d].pnl.fx + s.desks[d].pnl.equity + s.desks[d].pnl.vol + s.desks[d].pnl.credit + s.desks[d].pnl.cmdty)}`} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Costs and capital">
        <Card>
          <KV k="Costs to date (people, desks, tech, risk)" v={fm(s.costsCum)} />
          <KV k="Annual cost run-rate" v={fm(dailyCosts(s, 365).total)} />
          <KV k="Allocated capital" v={fm(alloc)} />
          <KV k="Capital used (risk-based)" v={fm(risk.capTotal)} />
          <KV k={`Daily capital charge (${fpct(HURDLE, 0)}/yr)`} v={fm((HURDLE * Math.max(alloc, risk.capTotal)) / 365)} />
          <LearnLink topic="capital" />
        </Card>
      </Section>

      {s.history.length > 1 ? (
        <Section title="Management confidence">
          <Card>
            <Sparkline data={s.history.map((h) => h.confidence)} width={w} height={50} baseline={50} />
            <T v="caption" style={{ marginTop: 4 }}>Now {Math.round(s.confidence)}/100. Below ~25 the board starts asking questions; at 0 you are replaced.</T>
          </Card>
        </Section>
      ) : null}

      <Section title={`Achievements · ${s.achievements.length}/${Object.keys(ACHIEVEMENTS).length}`}>
        <Card style={{ gap: 8 }}>
          {Object.entries(ACHIEVEMENTS).map(([k, a]) => {
            const got = s.achievements.includes(k);
            return (
              <Row key={k} gap={10}>
                <Ionicons name={got ? 'trophy' : 'trophy-outline'} size={16} color={got ? C.accent : C.textFaint} />
                <View style={{ flex: 1 }}>
                  <T v="small" color={got ? C.text : C.textDim}>{a.title}</T>
                  <T v="caption">{a.desc}</T>
                </View>
              </Row>
            );
          })}
        </Card>
      </Section>
    </Screen>
  );
}
