import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GameProvider, haptic, useGame } from './src/ui/GameContext';
import { NavProvider, useNav, type Tab } from './src/ui/nav';
import { ExplainProvider, Btn, Card, KV, Sheet, T } from './src/ui/components/ui';
import { LearnSheet } from './src/ui/components/Learn';
import { ClockBar } from './src/ui/components/ClockBar';
import { StartScreen } from './src/ui/screens/Start';
import { DeskScreen } from './src/ui/screens/Desk';
import { ManageScreen } from './src/ui/screens/Manage';
import { MarketsScreen } from './src/ui/screens/Markets';
import { ClientDetail, ClientsScreen } from './src/ui/screens/Clients';
import { TradingScreen } from './src/ui/screens/Trading';
import { BlotterScreen, BookScreen, LogScreen, PositionDetail } from './src/ui/screens/Book';
import { RiskScreen } from './src/ui/screens/Risk';
import { PnlScreen } from './src/ui/screens/Pnl';
import { C } from './src/ui/theme';
import { TOPICS } from './src/game/education';
import { fmSigned } from './src/engine/format';
import type { DeskId } from './src/engine/types';

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'desk', label: 'Desk', icon: 'briefcase-outline', active: 'briefcase' },
  { id: 'markets', label: 'Markets', icon: 'globe-outline', active: 'globe' },
  { id: 'clients', label: 'Clients', icon: 'people-outline', active: 'people' },
  { id: 'trading', label: 'Trading', icon: 'swap-horizontal-outline', active: 'swap-horizontal' },
  { id: 'book', label: 'Book', icon: 'layers-outline', active: 'layers' },
  { id: 'risk', label: 'Risk', icon: 'shield-outline', active: 'shield' },
  { id: 'pnl', label: 'P&L', icon: 'stats-chart-outline', active: 'stats-chart' },
];

function TabBar() {
  const nav = useNav();
  const g = useGame();
  const insets = useSafeAreaInsets();
  const s = g.s;
  const badges: Partial<Record<Tab, number>> = {
    desk: s?.decisions.filter((d) => d.status === 'open').length ?? 0,
    trading: s?.rfqs.filter((r) => r.status === 'open' && r.arrived).length ?? 0,
  };
  return (
    <View style={[styles.tabbar, { paddingTop: 4, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = nav.tab === t.id;
        const b = badges[t.id] ?? 0;
        return (
          <Pressable
            key={t.id}
            style={styles.tab}
            onPress={() => {
              haptic('light');
              nav.setTab(t.id);
            }}
          >
            <View>
              <Ionicons name={on ? t.active : t.icon} size={20} color={on ? C.accent : C.textFaint} />
              {b > 0 ? (
                <View style={[styles.badge, t.id === 'trading' ? { backgroundColor: C.accent } : null]}>
                  <Text style={[styles.badgeText, t.id === 'trading' ? { color: '#14110A' } : null]}>{b}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 9.5, marginTop: 2, color: on ? C.accent : C.textFaint, fontWeight: on ? '700' : '500' }} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Settings({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const g = useGame();
  const nav = useNav();
  const s = g.s;
  const [confirm, setConfirm] = useState(false);
  if (!s) return null;
  return (
    <Sheet visible={visible} onClose={() => { setConfirm(false); onClose(); }} title="Settings">
      <Card>
        <KV k="Difficulty" v={s.difficulty} />
        <KV k="Scenario seed" v={String(s.seed)} />
        <KV k="Day" v={String(s.day)} />
        <KV k="Saved" v="automatically, on this device" />
      </Card>
      <T v="label" style={{ marginTop: 20, marginBottom: 8 }}>Field guide</T>
      <Card style={{ gap: 2 }}>
        {Object.entries(TOPICS).map(([k, t]) => (
          <Pressable key={k} onPress={() => { onClose(); setTimeout(() => nav.learn(k), 350); }} style={{ paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="small" color={C.text}>{t.title}</T>
            <Ionicons name="chevron-forward" size={14} color={C.textFaint} />
          </Pressable>
        ))}
      </Card>
      <View style={{ marginTop: 24 }}>
        {confirm ? (
          <>
            <T v="small" color={C.down} style={{ marginBottom: 8 }}>This deletes the current game and its history.</T>
            <Btn title="Yes — resign and start over" tone="danger" onPress={() => { setConfirm(false); onClose(); g.quit(); }} />
          </>
        ) : (
          <Btn title="Start a new game" tone="ghost" onPress={() => setConfirm(true)} />
        )}
      </View>
    </Sheet>
  );
}

function Fired() {
  const g = useGame();
  const s = g.s!;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 40, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520 }}>
        <T v="label" color={C.down}>Day {s.day}</T>
        <T v="h1" style={{ marginTop: 8 }}>You have been replaced.</T>
        <T v="body" color={C.textDim} style={{ marginTop: 10 }}>{s.firedReason}</T>
        <Card style={{ marginTop: 24 }}>
          <KV k="Cumulative trading P&L" v={fmSigned(s.stats.cumPnl)} />
          <KV k="Economic profit" v={fmSigned(s.cumEP)} />
          <KV k="Max drawdown" v={fmSigned(-s.stats.maxDrawdown)} />
          <KV k="RFQs won / lost / passed" v={`${s.stats.rfqWon} / ${s.stats.rfqLost} / ${s.stats.rfqPassed}`} />
          <KV k="Achievements" v={String(s.achievements.length)} />
        </Card>
        <T v="small" style={{ marginTop: 16 }}>Trading businesses rarely fail from one bad trade. They fail from risk that was cheap to take, expensive to exit, and correlated with everything else when it mattered.</T>
        <Btn title="Start over" tone="primary" style={{ marginTop: 24 }} onPress={g.quit} />
      </View>
    </View>
  );
}

function Main() {
  const g = useGame();
  const nav = useNav();
  const [settings, setSettings] = useState(false);
  if (!g.loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (!g.s) return <StartScreen />;
  if (g.s.status === 'fired') return <Fired />;
  const top = nav.stack[nav.stack.length - 1];
  let body: React.ReactNode;
  if (top?.name === 'client') body = <ClientDetail key={top.id} id={top.id} />;
  else if (top?.name === 'position') body = <PositionDetail key={top.id} desk={top.desk as DeskId} id={top.id} />;
  else if (top?.name === 'blotter') body = <BlotterScreen />;
  else if (top?.name === 'log') body = <LogScreen />;
  else if (top?.name === 'manage') body = <ManageScreen />;
  else if (nav.tab === 'desk') body = <DeskScreen onSettings={() => setSettings(true)} />;
  else if (nav.tab === 'markets') body = <MarketsScreen />;
  else if (nav.tab === 'clients') body = <ClientsScreen />;
  else if (nav.tab === 'trading') body = <TradingScreen />;
  else if (nav.tab === 'book') body = <BookScreen />;
  else if (nav.tab === 'risk') body = <RiskScreen />;
  else body = <PnlScreen />;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>{body}</View>
      <ClockBar />
      <TabBar />
      <Settings visible={settings} onClose={() => setSettings(false)} />
      <LearnSheet />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NavProvider>
          <ExplainProvider>
            <StatusBar style="light" />
            <Main />
          </ExplainProvider>
        </NavProvider>
      </GameProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabbar: { flexDirection: 'row', backgroundColor: '#0D1117', paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center' },
  badge: { position: 'absolute', right: -10, top: -4, backgroundColor: C.down, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
