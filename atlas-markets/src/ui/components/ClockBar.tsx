import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmSigned } from '../../engine/format';
import { totalPnlToday } from '../../game/day';
import { CLOSE_MIN, clockLabel } from '../../game/live';
import { haptic, useGame, type Speed } from '../GameContext';
import { useNav } from '../nav';
import { C, F, signColor } from '../theme';

const SPEEDS: Speed[] = [0, 1, 3, 10];

/** The market clock: time, live P&L, latest headline and play/pause/speed. */
export function ClockBar() {
  const g = useGame();
  const nav = useNav();
  const s = g.s;
  if (!s || s.status !== 'playing') return null;
  const closed = s.clock >= CLOSE_MIN;
  const pnl = totalPnlToday(s);
  const last = s.news[s.news.length - 1];
  const fresh = last && s.clock - last.minute <= 45 && (last.minute > 0 || s.clock < 45);
  return (
    <View style={st.bar}>
      {fresh ? (
        <Pressable onPress={() => nav.setTab('desk')} style={st.news}>
          <Ionicons name="flash" size={11} color={C.warn} />
          <Text numberOfLines={1} style={{ color: C.warn, fontSize: 11.5, flex: 1 }}>{clockLabel(last.minute)} {last.text}</Text>
        </Pressable>
      ) : null}
      <View style={st.row}>
        <View style={[st.dot, { backgroundColor: closed ? C.textFaint : g.speed ? C.up : C.warn }]} />
        <Text style={[st.time, F.num]}>{clockLabel(s.clock)}</Text>
        <Text style={{ color: C.textFaint, fontSize: 11 }}>{closed ? 'closed' : g.speed ? 'live' : 'paused'}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[{ color: signColor(pnl), fontSize: 13, fontWeight: '700', marginRight: 10 }, F.num]}>{fmSigned(pnl)}</Text>
        {closed ? (
          <Pressable onPress={() => nav.setTab('desk')} style={[st.chip, { backgroundColor: C.accent }]}>
            <Text style={{ color: '#14110A', fontWeight: '700', fontSize: 12 }}>Book the day</Text>
          </Pressable>
        ) : (
          <View style={st.seg}>
            {SPEEDS.map((x) => (
              <Pressable
                key={x}
                hitSlop={4}
                onPress={() => {
                  haptic('light');
                  g.setSpeed(x);
                }}
                style={[st.segItem, g.speed === x ? { backgroundColor: x ? C.accent : C.surface3 } : null]}
              >
                {x ? (
                  <Text style={{ color: g.speed === x ? '#14110A' : C.textDim, fontWeight: '700', fontSize: 11.5 }}>{x}×</Text>
                ) : (
                  <Ionicons name="pause" size={12} color={g.speed === 0 ? C.text : C.textDim} />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { backgroundColor: '#0D1117', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  time: { color: C.text, fontWeight: '700', fontSize: 15 },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 8, padding: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  segItem: { minWidth: 32, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  news: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 3 },
});
