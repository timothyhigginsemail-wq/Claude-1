import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GameProvider, haptic, useGame } from './src/ui/GameContext';
import { NavProvider, useNav, type Tab } from './src/ui/nav';
import { ExplainProvider, Btn, Card, KV, Sheet, T } from './src/ui/components/ui';
import { LearnSheet } from './src/ui/components/Learn';
import { StartScreen } from './src/ui/screens/Start';
import { DeskScreen } from './src/ui/screens/Desk';
import { ClientDetail, ClientsScreen } from './src/ui/screens/Clients';
import { BookScreen, SecurityDetail } from './src/ui/screens/Book';
import { FundingScreen } from './src/ui/screens/Funding';
import { RiskScreen } from './src/ui/screens/Risk';
import { FinancialsScreen, LedgerScreen, LogScreen } from './src/ui/screens/Financials';
import { C } from './src/ui/theme';
import { TOPICS } from './src/game/education';
import { computeScore } from './src/game/scoring';
import { fm, fmSigned } from './src/engine/format';
import { pnlFromLedger, pnlTotal } from './src/engine/analytics';

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'desk', label: 'Desk', icon: 'briefcase-outline', active: 'briefcase' },
  { id: 'clients', label: 'Clients', icon: 'people-outline', active: 'people' },
  { id: 'book', label: 'Book', icon: 'layers-outline', active: 'layers' },
  { id: 'funding', label: 'Funding', icon: 'water-outline', active: 'water' },
  { id: 'risk', label: 'Risk', icon: 'shield-outline', active: 'shield' },
  { id: 'financials', label: 'P&L', icon: 'stats-chart-outline', active: 'stats-chart' },
];

function TabBar() {
  const nav = useNav();
  const g = useGame();
  const insets = useSafeAreaInsets();
  const pending = g.s?.events.filter((e) => e.status === 'pending').length ?? 0;
  return (
    <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = nav.tab === t.id;
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
              <Ionicons name={on ? t.active : t.icon} size={21} color={on ? C.accent : C.textFaint} />
              {t.id === 'desk' && pending > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pending}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 10, marginTop: 2, color: on ? C.accent : C.textFaint, fontWeight: on ? '700' : '500' }}>{t.label}</Text>
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
    <Sheet visible={visible} onClose={() => { setConfirm(false); onClose(); }} title="Desk settings">
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
            <T v="small" color={C.down} style={{ marginBottom: 8 }}>This deletes the current desk and its history.</T>
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
  const score = computeScore(s);
  const ni = pnlTotal(pnlFromLedger(s));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 40, paddingHorizontal: 20, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520 }}>
        <T v="label" color={C.down}>Day {s.day}</T>
        <T v="h1" style={{ marginTop: 8 }}>You have been replaced.</T>
        <T v="body" color={C.textDim} style={{ marginTop: 10 }}>{s.firedReason}</T>
        <Card style={{ marginTop: 24 }}>
          <KV k="Net income" v={fmSigned(ni)} />
          <KV k="Credit losses" v={fm(s.pnlCum.creditLoss)} />
          <KV k="Cumulative economic profit" v={fmSigned(s.cumEP)} />
          <KV k="Franchise score" v={score.total.toFixed(0)} />
        </Card>
        <T v="small" style={{ marginTop: 16 }}>Most prime brokerage disasters are slow decisions made in fast markets: lenient margin on concentrated books, funding that vanishes overnight, and calls issued a day too late.</T>
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
  else if (top?.name === 'security') body = <SecurityDetail key={top.id} id={top.id} />;
  else if (top?.name === 'ledger') body = <LedgerScreen />;
  else if (top?.name === 'log') body = <LogScreen />;
  else if (nav.tab === 'desk') body = <DeskScreen onSettings={() => setSettings(true)} />;
  else if (nav.tab === 'clients') body = <ClientsScreen />;
  else if (nav.tab === 'book') body = <BookScreen />;
  else if (nav.tab === 'funding') body = <FundingScreen />;
  else if (nav.tab === 'risk') body = <RiskScreen />;
  else body = <FinancialsScreen />;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>{body}</View>
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
  tabbar: { flexDirection: 'row', backgroundColor: '#0D1117', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center' },
  badge: { position: 'absolute', right: -9, top: -4, backgroundColor: C.down, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
