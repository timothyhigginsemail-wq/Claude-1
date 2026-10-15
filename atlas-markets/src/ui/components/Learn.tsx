import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

/** Small inline link that opens a field-guide topic. */
export function LearnLink({ topic, label }: { topic: string; label?: string }) {
  const nav = useNav();
  const t = TOPICS[topic];
  if (!t) return null;
  return (
    <Pressable onPress={() => nav.learn(topic)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
      <Ionicons name="school-outline" size={12} color={C.accent} />
      <T v="caption" color={C.accent}>{label ?? t.title}</T>
    </Pressable>
  );
}
