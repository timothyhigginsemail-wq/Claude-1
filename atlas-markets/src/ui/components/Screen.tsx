import React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../theme';
import { useNav } from '../nav';
import { Row, T } from './ui';

export const MAX_W = 560;

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_W) - S.lg * 2;
}

export function Screen({ title, subtitle, right, children, back }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: S.lg, paddingBottom: 10, backgroundColor: C.bg, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
        <View style={{ width: '100%', maxWidth: MAX_W - S.lg * 2, alignSelf: 'center' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={6} style={{ flex: 1 }}>
              {back ? (
                <Pressable onPress={nav.pop} hitSlop={12} style={{ marginLeft: -6, padding: 2 }}>
                  <Ionicons name="chevron-back" size={24} color={C.accent} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <T v="h2" numberOfLines={1}>{title}</T>
                {subtitle ? <T v="caption" numberOfLines={1}>{subtitle}</T> : null}
              </View>
            </Row>
            {right}
          </Row>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 110, paddingTop: 4, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: MAX_W - S.lg * 2 }}>{children}</View>
      </ScrollView>
    </View>
  );
}
