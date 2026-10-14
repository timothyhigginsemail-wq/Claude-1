import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Difficulty } from '../../engine/types';
import { Btn, Card, Row, Segmented, T } from '../components/ui';
import { MAX_W } from '../components/Screen';
import { useGame } from '../GameContext';
import { C, S } from '../theme';

const DIFF: Record<Difficulty, string> = {
  normal: 'Forgiving pricing and recoveries. Two analyst deep-dives a day.',
  advanced: 'Higher default probabilities, costlier desk, sharper competitors.',
  expert: 'Financially unforgiving but fair: credit data is fuzzy until you do due diligence, one analyst slot, more frequent shocks.',
};

export function StartScreen() {
  const g = useGame();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Difficulty>('normal');
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40, paddingHorizontal: S.lg, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: MAX_W - S.lg * 2 }}>
        <T v="label" color={C.accent}>Atlas Bank · Prime Services</T>
        <T v="h1" style={{ fontSize: 34, marginTop: 8, lineHeight: 40 }}>Run the{'\n'}prime brokerage desk.</T>
        <T v="body" color={C.textDim} style={{ marginTop: 14 }}>
          You have just been appointed Head of Prime Brokerage. You have $100m of capital, a $250m treasury facility, the bank's custody and settlement plumbing, a small securities-lending network — and no hedge fund clients.
        </T>
        <T v="body" color={C.textDim} style={{ marginTop: 10 }}>
          Win mandates, set margin and pricing, source stock borrow, fund the balance sheet, and survive what the market throws at you. You are scored on risk-adjusted economic profit, liquidity resilience and franchise strength — not on revenue or leverage.
        </T>
        <Card style={{ marginTop: S.xl }}>
          <T v="label" style={{ marginBottom: 8 }}>Difficulty</T>
          <Segmented value={d} options={[{ id: 'normal', label: 'Normal' }, { id: 'advanced', label: 'Advanced' }, { id: 'expert', label: 'Expert' }]} onChange={setD} />
          <T v="small" style={{ marginTop: 10 }}>{DIFF[d]}</T>
        </Card>
        <Btn title="Take the job" tone="primary" icon="briefcase-outline" style={{ marginTop: S.xl }} onPress={() => g.start(Math.floor(Math.random() * 1e9), d)} />
        <Btn title="Play the reference scenario (seed 2027)" tone="ghost" style={{ marginTop: S.md }} onPress={() => g.start(2027, d)} />
        <Card style={{ marginTop: S.xl }}>
          <T v="label">What you'll learn by doing</T>
          {[
            'How a $200m long with $80m of equity becomes a margin loan, collateral and a funding need',
            'Why short proceeds are restricted customer money, and how internalising shorts saves funding',
            'Where repo, treasury FTP and the customer reserve formula fit into the desk balance sheet',
            'Why one client paying a tight spread can be worth more than another paying double',
            'How a fund with positive NAV can still default to you',
          ].map((x) => (
            <Row key={x} gap={8} style={{ marginTop: 8, alignItems: 'flex-start' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent, marginTop: 7 }} />
              <T v="small" color={C.text} style={{ flex: 1 }}>{x}</T>
            </Row>
          ))}
        </Card>
        <T v="caption" style={{ marginTop: S.lg }}>All institutions, securities and rates are fictional and illustrative. Regulatory treatments are labelled approximations.</T>
      </View>
    </ScrollView>
  );
}
