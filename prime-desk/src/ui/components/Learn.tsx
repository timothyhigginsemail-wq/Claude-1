import React from 'react';
import { View } from 'react-native';
import { TOPICS } from '../../game/education';
import { useNav } from '../nav';
import { C, S } from '../theme';
import { Card, Sheet, T } from './ui';

export function LearnPanel({ topic }: { topic: string }) {
  const t = TOPICS[topic];
  if (!t) return null;
  return (
    <View>
      <T v="h3" color={C.accent}>{t.title}</T>
      <T v="body" style={{ marginTop: 6 }}>{t.summary}</T>
      {t.sections.map((x, i) => (
        <View key={i} style={{ marginTop: S.md }}>
          <T v="label">{x.h}</T>
          <T v="small" style={{ marginTop: 4, color: C.text }}>{x.p}</T>
        </View>
      ))}
    </View>
  );
}

export function LearnCard({ topic }: { topic: string }) {
  return (
    <Card style={{ marginTop: S.sm }} accent={C.accent}>
      <LearnPanel topic={topic} />
    </Card>
  );
}

/** Top-level sheet (opened from screens, never from inside another sheet). */
export function LearnSheet() {
  const nav = useNav();
  return (
    <Sheet visible={!!nav.topic} onClose={nav.closeLearn} title="How it works">
      {nav.topic ? <LearnPanel topic={nav.topic} /> : null}
    </Sheet>
  );
}
