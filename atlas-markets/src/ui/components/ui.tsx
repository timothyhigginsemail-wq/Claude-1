import React, { createContext, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Calc } from '../../engine/explain';
import { fm, fpct, fx } from '../../engine/format';
import { C, F, R, S } from '../theme';

// ---------------------------------------------------------------- text

type TV = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'num' | 'numLg' | 'numXl' | 'caption';

const tv: Record<TV, TextStyle> = {
  h1: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  h3: { fontSize: 15, fontWeight: '600', color: C.text },
  body: { fontSize: 14.5, color: C.text, lineHeight: 21 },
  small: { fontSize: 12.5, color: C.textDim, lineHeight: 17 },
  caption: { fontSize: 11, color: C.textFaint, lineHeight: 15 },
  label: { fontSize: 10.5, fontWeight: '600', color: C.textFaint, letterSpacing: 0.9, textTransform: 'uppercase' },
  num: { fontSize: 14, color: C.text, fontWeight: '500', ...F.num },
  numLg: { fontSize: 20, color: C.text, fontWeight: '600', letterSpacing: -0.3, ...F.num },
  numXl: { fontSize: 30, color: C.text, fontWeight: '700', letterSpacing: -0.8, ...F.num },
};

export function T({ v = 'body', style, children, color, numberOfLines, center }: { v?: TV; style?: TextStyle | TextStyle[]; children?: React.ReactNode; color?: string; numberOfLines?: number; center?: boolean }) {
  return (
    <Text numberOfLines={numberOfLines} style={[tv[v], color ? { color } : null, center ? { textAlign: 'center' } : null, style as TextStyle]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- layout

export function Card({ children, style, onPress, accent }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; accent?: string }) {
  const inner = (
    <View style={[st.card, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] }]}>
      {inner}
    </Pressable>
  );
}

export function Row({ children, style, gap = 8 }: { children: React.ReactNode; style?: ViewStyle; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, right, children, style }: { title: string; right?: React.ReactNode; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ marginTop: S.xl }, style]}>
      <Row style={{ justifyContent: 'space-between', marginBottom: S.sm, paddingHorizontal: 2 }}>
        <T v="label">{title}</T>
        {right}
      </Row>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.sm }, style]} />;
}

export function Pill({ text, color = C.textDim, filled }: { text: string; color?: string; filled?: boolean }) {
  return (
    <View style={[st.pill, { borderColor: color + '66', backgroundColor: filled ? color + '22' : 'transparent' }]}>
      <Text style={{ color, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5 }}>{text.toUpperCase()}</Text>
    </View>
  );
}

export function Btn({ title, onPress, tone = 'neutral', icon, disabled, small, style }: { title: string; onPress: () => void; tone?: 'primary' | 'neutral' | 'danger' | 'ghost'; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; small?: boolean; style?: ViewStyle }) {
  const bg = tone === 'primary' ? C.accent : tone === 'danger' ? C.down + '22' : tone === 'ghost' ? 'transparent' : C.surface3;
  const fg = tone === 'primary' ? '#14110A' : tone === 'danger' ? C.down : C.text;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        st.btn,
        small ? { paddingVertical: 7, paddingHorizontal: 12 } : null,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1, borderColor: tone === 'ghost' ? C.border : 'transparent' },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={small ? 14 : 16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 12.5 : 14.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Bar({ value, max, color = C.accent, height = 6, marker, bg = C.surface3 }: { value: number; max: number; color?: string; height?: number; marker?: number; bg?: string }) {
  const w = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <View style={{ height, backgroundColor: bg, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${w * 100}%`, height, backgroundColor: color, borderRadius: height }} />
      {marker !== undefined && max > 0 ? <View style={{ position: 'absolute', left: `${Math.min(1, marker / max) * 100}%`, top: -2, bottom: -2, width: 2, backgroundColor: C.text }} /> : null}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={st.seg}>
      {options.map((o) => (
        <Pressable key={o.id} onPress={() => onChange(o.id)} style={[st.segItem, value === o.id ? st.segActive : null]}>
          <Text style={{ color: value === o.id ? C.text : C.textDim, fontSize: 12.5, fontWeight: '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stepper({ value, onChange, min, max, step, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  const clamp = (x: number) => Math.max(min, Math.min(max, Math.round(x / step) * step));
  return (
    <View style={st.stepper}>
      <Pressable hitSlop={8} onPress={() => onChange(clamp(value - step))} style={st.stepBtn}>
        <Ionicons name="remove" size={16} color={C.text} />
      </Pressable>
      <Text style={[{ color: C.text, fontWeight: '600', minWidth: 74, textAlign: 'center', fontSize: 14 }, F.num]}>{format(value)}</Text>
      <Pressable hitSlop={8} onPress={() => onChange(clamp(value + step))} style={st.stepBtn}>
        <Ionicons name="add" size={16} color={C.text} />
      </Pressable>
    </View>
  );
}

export function KV({ k, v, tone, onPress, sub }: { k: string; v: string; tone?: string; onPress?: () => void; sub?: string }) {
  const body = (
    <View style={st.kv}>
      <T v="small" style={{ flex: 1 }}>{k}</T>
      <View style={{ alignItems: 'flex-end', flexShrink: 1, maxWidth: '62%' }}>
        <Row gap={4} style={{ flexShrink: 1 }}>
          <T v="num" color={tone} style={{ textAlign: 'right', flexShrink: 1 }}>{v}</T>
          {onPress ? <Ionicons name="chevron-forward" size={12} color={C.textFaint} /> : null}
        </Row>
        {sub ? <T v="caption">{sub}</T> : null}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

// ---------------------------------------------------------------- explain (tap a number)

interface ExplainCtx {
  open: (c: Calc | (() => Calc)) => void;
}
const ExplainContext = createContext<ExplainCtx>({ open: () => undefined });

export function useExplain() {
  return useContext(ExplainContext);
}

export function fmtCalc(c: Calc): string {
  switch (c.fmt) {
    case 'pct':
      return fpct(c.value);
    case 'bps':
      return `${Math.round(c.value)}bp`;
    case 'x':
      return fx(c.value, 2);
    case 'num':
      return c.value.toLocaleString();
    case 'days':
      return `${c.value}d`;
    case 'rate':
      return fpct(c.value, 2);
    default:
      return fm(c.value);
  }
}

function CalcNode({ c, depth }: { c: Calc; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const has = !!c.children?.length;
  return (
    <View style={{ marginLeft: depth ? 10 : 0, borderLeftWidth: depth ? StyleSheet.hairlineWidth : 0, borderLeftColor: C.borderStrong, paddingLeft: depth ? 10 : 0 }}>
      <Pressable onPress={() => has && setOpen(!open)} style={{ paddingVertical: 8 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Row gap={6} style={{ flex: 1, alignItems: 'flex-start' }}>
            {has ? <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color={C.textDim} style={{ marginTop: 2 }} /> : <View style={{ width: 13 }} />}
            <T v={depth === 0 ? 'h3' : 'small'} color={depth === 0 ? C.text : C.textDim} style={{ flex: 1 }}>{c.label}</T>
          </Row>
          <T v={depth === 0 ? 'numLg' : 'num'} color={c.value < 0 && (!c.fmt || c.fmt === 'money') ? C.down : C.text}>{fmtCalc(c)}</T>
        </Row>
        {c.formula ? <T v="caption" style={{ marginLeft: 19, marginTop: 2, fontFamily: F.mono }}>{c.formula}</T> : null}
        {c.note && (open || !has) ? <T v="caption" style={{ marginLeft: 19, marginTop: 3, color: C.textDim }}>{c.note}</T> : null}
      </Pressable>
      {has && open ? c.children!.map((ch, i) => <CalcNode key={i} c={ch} depth={depth + 1} />) : null}
    </View>
  );
}

export function ExplainProvider({ children }: { children: React.ReactNode }) {
  const [calc, setCalc] = useState<Calc | null>(null);
  const api = useMemo(() => ({ open: (c: Calc | (() => Calc)) => setCalc(typeof c === 'function' ? c() : c) }), []);
  return (
    <ExplainContext.Provider value={api}>
      {children}
      <Sheet visible={!!calc} onClose={() => setCalc(null)} title="How this number is built">
        {calc ? <CalcNode c={calc} depth={0} /> : null}
        <T v="caption" style={{ marginTop: S.lg }}>Tap a line with an arrow to expand it. All rates are illustrative; interest accrues ACT/360.</T>
      </Sheet>
    </ExplainContext.Provider>
  );
}

/** A tappable metric that opens its calculation tree. */
export function Metric({ label, value, calc, tone, sub, style, big }: { label: string; value: string; calc?: () => Calc; tone?: string; sub?: string; style?: ViewStyle; big?: boolean }) {
  const { open } = useExplain();
  return (
    <Pressable disabled={!calc} onPress={() => calc && open(calc)} style={({ pressed }) => [st.metric, style, { opacity: pressed ? 0.75 : 1 }]}>
      <Row gap={4}>
        <T v="label" style={{ flexShrink: 1 }} numberOfLines={1}>{label}</T>
        {calc ? <Ionicons name="information-circle-outline" size={11} color={C.textFaint} /> : null}
      </Row>
      <T v={big ? 'numXl' : 'numLg'} color={tone} style={{ marginTop: 4 }} numberOfLines={1}>{value}</T>
      {sub ? <T v="caption" numberOfLines={1}>{sub}</T> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- sheet (modal)

export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} transparent={Platform.OS !== 'ios'} onRequestClose={onClose}>
      <View style={[{ flex: 1, backgroundColor: Platform.OS === 'ios' ? C.surface : C.overlay }]}>
        <View style={[st.sheet, Platform.OS !== 'ios' ? { marginTop: 40 + insets.top, borderTopLeftRadius: 18, borderTopRightRadius: 18 } : { flex: 1 }]}>
          <View style={st.sheetHeader}>
            <View style={st.grabber} />
            <Row style={{ justifyContent: 'space-between', width: '100%' }}>
              <T v="h3" style={{ flex: 1 }} numberOfLines={1}>{title ?? ''}</T>
              <Pressable onPress={onClose} hitSlop={12} style={st.close}>
                <Ionicons name="close" size={18} color={C.text} />
              </Pressable>
            </Row>
          </View>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[st.sheetFooter, { paddingBottom: S.md + insets.bottom }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- facts grid

export function FactGrid({ facts }: { facts: { label: string; value: string; tone?: string }[] }) {
  return (
    <View style={st.grid}>
      {facts.map((f, i) => (
        <View key={i} style={st.gridItem}>
          <T v="caption" numberOfLines={2}>{f.label}</T>
          <T v="num" color={f.tone === 'up' ? C.up : f.tone === 'down' ? C.down : f.tone === 'warn' ? C.warn : C.text} style={{ marginTop: 2 }}>{f.value}</T>
        </View>
      ))}
    </View>
  );
}

export const st = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: R.md, borderWidth: 1 },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: R.md, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  segItem: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: R.sm },
  segActive: { backgroundColor: C.surface3 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: R.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  stepBtn: { padding: 9 },
  kv: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
  metric: { flex: 1, backgroundColor: C.surface, borderRadius: R.lg, padding: S.md, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, minWidth: 0 },
  sheet: { backgroundColor: C.surface, flex: 1 },
  sheetHeader: { alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: C.borderStrong, marginTop: 8, marginBottom: 10 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface3, alignItems: 'center', justifyContent: 'center' },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, padding: S.md, backgroundColor: C.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  gridItem: { width: '50%', paddingHorizontal: 4, paddingVertical: 6 },
});
