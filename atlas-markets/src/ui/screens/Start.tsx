import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameState } from '../../engine/types';
import { Btn, Card, Row, Segmented, T } from '../components/ui';
import { MAX_W } from '../components/Screen';
import { useGame } from '../GameContext';
import { C, S } from '../theme';

type Diff = GameState['difficulty'];

const DIFF: Record<Diff, string> = {
  normal: 'Competitors are beatable, clients forgive the odd missed quote, informed flow is moderate.',
  advanced: 'Tighter competitors, more informed flow, sharper market moves.',
  expert: 'Electronic market makers everywhere, toxic flow, unforgiving management.',
};

export function StartScreen() {
  const g = useGame();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Diff>('normal');
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40, paddingHorizontal: S.lg, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: MAX_W - S.lg * 2 }}>
        <T v="label" color={C.accent}>Atlas Bank · Global Markets</T>
        <T v="h1" style={{ fontSize: 34, marginTop: 8, lineHeight: 40 }}>Run the{'\n'}trading floor.</T>
        <T v="body" color={C.textDim} style={{ marginTop: 14 }}>
          You are the new Head of Global Markets. Equities, Rates and FX are live with $800m of capital. Credit, Commodities and Cross-Asset Exotics launch over the first three weeks — if you want them.
        </T>
        <T v="body" color={C.textDim} style={{ marginTop: 10 }}>
          Quote client RFQs against competing dealers, hedge the risk you take on, stay inside your limits, and earn more than the 12% cost of the capital you consume. Management is watching.
        </T>
        <Card style={{ marginTop: S.xl }}>
          <T v="label" style={{ marginBottom: 8 }}>Difficulty</T>
          <Segmented value={d} options={[{ id: 'normal', label: 'Normal' }, { id: 'advanced', label: 'Advanced' }, { id: 'expert', label: 'Expert' }]} onChange={setD} />
          <T v="small" style={{ marginTop: 10 }}>{DIFF[d]}</T>
        </Card>
        <Btn title="Take the job" tone="primary" icon="briefcase-outline" style={{ marginTop: S.xl }} onPress={() => g.start(Math.floor(Math.random() * 1e9), d)} />
        <Btn title="Play the reference scenario (seed 2027)" tone="ghost" style={{ marginTop: S.md }} onPress={() => g.start(2027, d)} />
        <Card style={{ marginTop: S.xl }}>
          <T v="label">Each day</T>
          {[
            ['Desk', 'Morning briefing: overnight moves, today\'s data, management decisions'],
            ['Trading', 'Price client RFQs, see the competition\'s cover, hedge in the street'],
            ['Book · Risk', 'Positions, Greeks, DV01, VaR, stress tests and limits'],
            ['P&L', 'Close the day and see exactly why you made or lost money'],
          ].map(([h, x]) => (
            <Row key={h} gap={8} style={{ marginTop: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 7 }} />
              <T v="small" color={C.text} style={{ flex: 1 }}>
                <T v="small" color={C.accent}>{h}: </T>
                {x}
              </T>
            </Row>
          ))}
        </Card>
        <T v="caption" style={{ marginTop: S.lg }}>All institutions, clients, securities and prices are fictional. Pricing models are standard textbook approximations; simplifications are listed in the README.</T>
      </View>
    </ScrollView>
  );
}
