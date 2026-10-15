import React, { useState } from 'react';
import { View } from 'react-native';
import { fm, fpct } from '../../engine/format';
import type { DeskId } from '../../engine/types';
import { allocated, candidates, dailyCosts, HURDLE, TECH_COST, VAR_PER_CAPITAL } from '../../game/manage';
import { DESK_META } from '../../game/setup';
import { LearnLink } from '../components/Learn';
import { Screen } from '../components/Screen';
import { Bar, Btn, Card, KV, Pill, Row, Section, Segmented, Stepper, T } from '../components/ui';
import { useGame } from '../GameContext';
import { C, S } from '../theme';
import { DESKS, useRisk } from '../useRisk';

const FLOW = [
  { id: '0.8', label: 'Tight' },
  { id: '1', label: 'Standard' },
  { id: '1.25', label: 'Wide' },
];
const HEDGE = [
  { id: '0', label: '0%' },
  { id: '0.25', label: '25%' },
  { id: '0.5', label: '50%' },
  { id: '0.75', label: '75%' },
  { id: '1', label: '100%' },
];

export function ManageScreen() {
  const g = useGame();
  const s = g.s!;
  const risk = useRisk()!;
  const [msg, setMsg] = useState<string | null>(null);
  const [hiring, setHiring] = useState<DeskId | null>(null);
  const alloc = allocated(s);
  const costs = dailyCosts(s, 365);
  return (
    <Screen title="Management" subtitle="Capital, limits, people, technology" back>
      {msg ? (
        <Card style={{ marginTop: S.md }} accent={C.accent}>
          <T v="small" color={C.text}>{msg}</T>
        </Card>
      ) : null}
      <Section title="Firm capital">
        <Card>
          <KV k="Firm capital available to Markets" v={fm(s.firmCapital)} />
          <KV k="Allocated to desks" v={fm(alloc)} />
          <KV k="Unallocated (no charge, no limits)" v={fm(s.firmCapital - alloc)} />
          <KV k="Capital actually used (risk-based)" v={fm(risk.capTotal)} tone={risk.capTotal > alloc ? C.down : undefined} />
          <KV k={`Annual capital charge (${fpct(HURDLE, 0)} on allocated)`} v={fm(alloc * HURDLE)} />
          <KV k="Annual fixed costs (desks, traders, tech, risk)" v={fm(costs.total)} />
          <T v="caption" style={{ marginTop: 6 }}>Allocated capital sets each desk's VaR and sensitivity limits. You pay the hurdle on whatever is allocated (or used, if higher) — idle capital is expensive, too little capital means breaches.</T>
          <LearnLink topic="capital" />
        </Card>
      </Section>

      {DESKS.map((id) => {
        const d = s.desks[id];
        const meta = DESK_META[id];
        if (!d.unlocked)
          return (
            <Section key={id} title={meta.name}>
              <Card>
                <T v="small">Not launched. {s.day >= meta.unlockDay ? 'The board has approved this business.' : `Board approval expected around day ${meta.unlockDay}.`}</T>
                {s.day >= meta.unlockDay ? <Btn title="Propose launch" small style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => { g.launch(id); setMsg(`Launch proposal for ${meta.name} added to your decisions on the Desk tab.`); }} /> : null}
              </Card>
            </Section>
          );
        const traders = s.traders.filter((t) => t.desk === id);
        const used = risk.cap[id].total;
        return (
          <Section key={id} title={meta.name} right={d.restrictedUntil > s.day ? <Pill text="restricted" color={C.down} /> : undefined}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small">Allocated capital</T>
                <Stepper value={d.capital} min={0} max={s.firmCapital - alloc + d.capital} step={25e6} format={(x) => fm(x)} onChange={(x) => setMsg(g.capital(id, x))} />
              </Row>
              <View style={{ marginTop: 10 }}>
                <Bar value={used} max={Math.max(d.capital, used) * 1.1} marker={d.capital} color={used > d.capital ? C.down : meta.color} />
                <T v="caption" style={{ marginTop: 4 }}>Using {fm(used)} of {fm(d.capital)} · VaR limit {fm(d.limits.var)} ({fpct(VAR_PER_CAPITAL[id], 2)} of capital)</T>
              </View>
              {id !== 'exotics' ? (
                <>
                  <T v="label" style={{ marginTop: 14, marginBottom: 6 }}>Electronic flow pricing</T>
                  <Segmented value={String(d.flowSpread)} options={FLOW} onChange={(x) => g.deskParam(id, { flowSpread: Number(x) })} />
                  <T v="caption" style={{ marginTop: 4 }}>Tight wins more volume but attracts more informed (toxic) flow; wide earns more per trade on less volume.</T>
                </>
              ) : null}
              <T v="label" style={{ marginTop: 14, marginBottom: 6 }}>Auto-hedge residual risk at the close</T>
              <Segmented value={String(d.autoHedge)} options={HEDGE} onChange={(x) => g.deskParam(id, { autoHedge: Number(x) })} />
              <T v="caption" style={{ marginTop: 4 }}>Hedging costs spread every day; not hedging leaves market risk (and VaR) on the book.</T>
              <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <T v="small">Electronic platform: level {d.tech}/3</T>
                  <T v="caption">More flow and cheaper execution. +{fm(TECH_COST)}/yr, $3m to build.</T>
                </View>
                <Btn title="Upgrade" small disabled={d.tech >= 3} onPress={() => setMsg(g.tech(id))} />
              </Row>
              <T v="label" style={{ marginTop: 14, marginBottom: 4 }}>Traders</T>
              {traders.map((t) => (
                <Row key={t.id} style={{ justifyContent: 'space-between', paddingVertical: 5 }}>
                  <View style={{ flex: 1 }}>
                    <T v="small" color={C.text}>{t.name}</T>
                    <T v="caption">{t.style} · skill {Math.round(t.skill * 100)} · {fm(t.cost)}/yr</T>
                  </View>
                  <Btn title="Let go" small tone="ghost" onPress={() => setMsg(g.fireT(t.id))} />
                </Row>
              ))}
              {hiring === id ? (
                <View style={{ marginTop: 6, gap: 6 }}>
                  {candidates(s, id).map((t) => (
                    <Row key={t.id} style={{ justifyContent: 'space-between', backgroundColor: C.surface2, borderRadius: 8, padding: 8 }}>
                      <View style={{ flex: 1 }}>
                        <T v="small" color={C.text}>{t.name}</T>
                        <T v="caption">{t.style} · skill {Math.round(t.skill * 100)} · {fm(t.cost)}/yr</T>
                      </View>
                      <Btn title="Hire" small tone="primary" onPress={() => { setMsg(g.hireT(t)); setHiring(null); }} />
                    </Row>
                  ))}
                </View>
              ) : (
                <Btn title="See candidates" small tone="ghost" style={{ marginTop: 6, alignSelf: 'flex-start' }} onPress={() => setHiring(id)} />
              )}
              <T v="caption" style={{ marginTop: 6 }}>Skilled traders capture more flow spread and hedge more cheaply. Sign-on 25% of salary; severance 50%.</T>
            </Card>
          </Section>
        );
      })}
    </Screen>
  );
}
