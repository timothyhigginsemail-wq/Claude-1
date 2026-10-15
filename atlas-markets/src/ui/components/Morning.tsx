import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fm, fmSigned } from '../../engine/format';
import { REGIMES } from '../../engine/market';
import { dailyTarget } from '../../game/goals';
import { DESK_META } from '../../game/setup';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { regimeColor } from '../screens/Desk';
import { C, S, signColor } from '../theme';
import { DESKS } from '../useRisk';
import { Btn, Card, Pill, Row, Sheet, T } from './ui';

/** The start of each day: what happened, what's coming, what you need to make. Then open the market. */
export function MorningSheet() {
  const g = useGame();
  const nav = useNav();
  const s = g.s;
  const [seen, setSeen] = useState(0);
  if (!s || s.status !== 'playing') return null;
  const visible = s.clock === 0 && !g.speed && seen !== s.day && !g.report;
  if (!visible) return null;
  const t = dailyTarget(s);
  const last = s.lastReport;
  const events = s.events.filter((e) => e.day === s.day);
  const decisions = s.decisions.filter((d) => d.status === 'open');
  const warnings = DESKS.filter((d) => s.desks[d].unlocked && (s.desks[d].breachDays > 0 || s.desks[d].restrictedUntil > s.day));
  const close = () => setSeen(s.day);
  return (
    <Sheet
      visible
      onClose={close}
      title={`Day ${s.day} · ${s.date}`}
      footer={
        <Btn
          title="Open the market"
          icon="play"
          tone="primary"
          onPress={() => {
            close();
            g.setSpeed(1);
            nav.setTab('trading');
          }}
        />
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="label">Morning meeting</T>
        <Pill text={REGIMES[s.market.regime].label} color={regimeColor(s.market.regime)} filled />
      </Row>
      {last ? (
        <Card style={{ marginTop: S.md }}>
          <T v="caption">Yesterday</T>
          <Row style={{ justifyContent: 'space-between', marginTop: 2 }}>
            <T v="numLg" color={signColor(last.total)}>{fmSigned(last.total)}</T>
            <T v="small">economic profit <Text style={{ color: signColor(last.ep) }}>{fmSigned(last.ep)}</Text></T>
          </Row>
          <View style={st.moves}>
            {last.moves.slice(0, 6).map((m) => (
              <View key={m.label} style={{ width: '33.3%', paddingTop: 6 }}>
                <T v="caption">{m.label}</T>
                <T v="small" color={m.tone === 'up' ? C.up : C.down}>{m.value}</T>
              </View>
            ))}
          </View>
        </Card>
      ) : (
        <Card style={{ marginTop: S.md }}>
          <T v="small" color={C.text}>Your first day running the floor. Clients will call through the day asking for prices. Win their business at a sensible spread, decide what risk to keep and what to hedge, and make more than the desk costs to run.</T>
        </Card>
      )}
      <Card style={{ marginTop: 8 }} accent={C.accent}>
        <T v="caption">Today's target</T>
        <T v="numLg" style={{ marginTop: 2 }}>{fm(t.breakEven)} to break even</T>
        <T v="caption" style={{ marginTop: 2 }}>Running costs {fm(t.costs)} + capital charge {fm(t.capital)} (12% a year on allocated capital). Beat it and you create value; a strong day is {fm(t.strong)}.</T>
      </Card>
      <Card style={{ marginTop: 8 }}>
        <T v="caption" style={{ marginBottom: 4 }}>On the calendar</T>
        {events.length ? (
          events.map((e) => (
            <Row key={e.id} gap={10} style={{ paddingVertical: 3 }}>
              <T v="small" style={{ width: 42 }}>{e.time}</T>
              <T v="small" color={C.text} style={{ flex: 1 }}>{e.title}</T>
              <T v="caption">{e.consensus}</T>
            </Row>
          ))
        ) : (
          <T v="small">No scheduled data. Flow-driven day.</T>
        )}
        <T v="caption" style={{ marginTop: 6 }}>Expect {s.rfqs.length} client calls across {[...new Set(s.rfqs.map((r) => DESK_META[r.desk].short))].join(', ')}.</T>
      </Card>
      {warnings.length ? (
        <Card style={{ marginTop: 8 }} accent={C.down}>
          {warnings.map((d) => (
            <T key={d} v="small" color={C.text}>
              {s.desks[d].restrictedUntil > s.day ? `${DESK_META[d].name} is restricted by risk management until day ${s.desks[d].restrictedUntil}.` : `${DESK_META[d].name} closed over a limit yesterday. Be back inside by today's close, or risk management will cut it for you.`}
            </T>
          ))}
        </Card>
      ) : null}
      {decisions.length ? (
        <Card style={{ marginTop: 8 }} accent={C.warn} onPress={() => { close(); nav.setTab('desk'); }}>
          <T v="small" color={C.text}>{decisions.length} decision{decisions.length > 1 ? 's' : ''} waiting: {decisions.map((d) => d.title).join(' · ')}</T>
          <T v="caption" color={C.accent} style={{ marginTop: 2 }}>Review on the Desk tab →</T>
        </Card>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({ moves: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 } });
