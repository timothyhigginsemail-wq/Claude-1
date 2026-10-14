import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { fm } from '../../engine/format';
import { C, F } from '../theme';

const C_FONT = F.sans as string;
import { Row, T } from './ui';

export function Sparkline({ data, width = 120, height = 36, color = C.accent, fill = true, baseline }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean; baseline?: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...data, baseline ?? Infinity);
  const hi = Math.max(...data, baseline ?? -Infinity);
  const span = hi - lo || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * width, height - 2 - ((d - lo) / span) * (height - 4)] as const);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  const id = `g${Math.abs(Math.round(data[0] * 1000 + data.length)) % 99999}`;
  const by = baseline !== undefined ? height - 2 - ((baseline - lo) / span) * (height - 4) : null;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {fill ? <Path d={area} fill={`url(#${id})`} /> : null}
      {by !== null ? <Line x1={0} x2={width} y1={by} y2={by} stroke={C.borderStrong} strokeDasharray="3,3" strokeWidth={1} /> : null}
      <Path d={path} stroke={color} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

/** Vertical bars around zero (e.g. daily P&L). */
export function BarSeries({ data, width, height = 90, labels }: { data: number[]; width: number; height?: number; labels?: string[] }) {
  const [sel, setSel] = useState<number | null>(null);
  if (!data.length) return <View style={{ height }} />;
  const max = Math.max(...data.map(Math.abs), 1);
  const bw = width / data.length;
  const mid = height / 2;
  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={mid} y2={mid} stroke={C.border} strokeWidth={1} />
        {data.map((d, i) => {
          const h = (Math.abs(d) / max) * (mid - 2);
          return <Rect key={i} x={i * bw + bw * 0.15} y={d >= 0 ? mid - h : mid} width={Math.max(1, bw * 0.7)} height={Math.max(0.5, h)} fill={d >= 0 ? C.up : C.down} opacity={sel === null || sel === i ? 0.9 : 0.35} rx={1} />;
        })}
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, flexDirection: 'row' }}>
        {data.map((_, i) => (
          <Pressable key={i} style={{ flex: 1 }} onPress={() => setSel(sel === i ? null : i)} />
        ))}
      </View>
      <T v="caption" style={{ marginTop: 4 }}>{sel !== null ? `${labels?.[sel] ?? `#${sel + 1}`}: ${fm(data[sel])}` : 'Tap a bar for the value'}</T>
    </View>
  );
}

export interface StackSeg {
  label: string;
  value: number;
  color: string;
}

/** Two stacked columns side by side (e.g. uses vs sources of funding). */
export function TwinStack({ left, right, leftTitle, rightTitle, width, height = 220 }: { left: StackSeg[]; right: StackSeg[]; leftTitle: string; rightTitle: string; width: number; height?: number }) {
  const tl = left.reduce((a, s) => a + Math.max(0, s.value), 0);
  const tr = right.reduce((a, s) => a + Math.max(0, s.value), 0);
  const tot = Math.max(tl, tr, 1);
  const colW = Math.min(110, width * 0.3);
  const gap = width - colW * 2;
  const col = (segs: StackSeg[], x: number) => {
    let y = height;
    return segs
      .filter((s) => s.value > 0)
      .map((s, i) => {
        const h = (s.value / tot) * (height - 2);
        y -= h;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={colW} height={Math.max(0.5, h - 1)} fill={s.color} rx={2} />
            {h > 16 ? (
              <SvgText x={x + colW / 2} y={y + h / 2 + 4} fill="#0A0D12" fontSize={10.5} fontWeight="700" textAnchor="middle" fontFamily={C_FONT}>
                {fm(s.value)}
              </SvgText>
            ) : null}
          </G>
        );
      });
  };
  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <T v="label" style={{ width: colW, textAlign: 'center' }}>{leftTitle}</T>
        <T v="label" style={{ width: colW, textAlign: 'center' }}>{rightTitle}</T>
      </Row>
      <Svg width={width} height={height}>
        {col(left, 0)}
        {col(right, colW + gap)}
        <Line x1={colW + 6} x2={colW + gap - 6} y1={height - (tl / tot) * height} y2={height - (tr / tot) * height} stroke={C.borderStrong} strokeDasharray="4,4" />
      </Svg>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
        <Legend segs={left} width={colW + gap / 2 - 6} />
        <Legend segs={right} width={colW + gap / 2 - 6} right />
      </Row>
    </View>
  );
}

function Legend({ segs, width, right }: { segs: StackSeg[]; width: number; right?: boolean }) {
  return (
    <View style={{ width, gap: 3 }}>
      {segs.map((s, i) => (
        <Row key={i} gap={5} style={{ justifyContent: right ? 'flex-end' : 'flex-start' }}>
          {!right ? <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} /> : null}
          <T v="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{s.label} {fm(s.value)}</T>
          {right ? <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} /> : null}
        </Row>
      ))}
    </View>
  );
}

/** Horizontal waterfall: components building up to a total. */
export function Waterfall({ items, width, total, totalLabel }: { items: { label: string; value: number }[]; width: number; total: number; totalLabel: string }) {
  const rows = [...items.filter((i) => Math.abs(i.value) > 1)];
  let acc = 0;
  const ext = [0];
  for (const r of rows) {
    acc += r.value;
    ext.push(acc);
  }
  const lo = Math.min(...ext, total, 0);
  const hi = Math.max(...ext, total, 0);
  const span = hi - lo || 1;
  const labelW = 118;
  const chartW = width - labelW - 62;
  const x = (v: number) => ((v - lo) / span) * chartW;
  acc = 0;
  return (
    <View style={{ gap: 5 }}>
      {rows.map((r, i) => {
        const a = acc;
        acc += r.value;
        const x0 = x(Math.min(a, acc));
        const w = Math.max(1.5, Math.abs(x(acc) - x(a)));
        return (
          <Row key={i} gap={6}>
            <T v="caption" numberOfLines={1} style={{ width: labelW, color: C.textDim }}>{r.label}</T>
            <Svg width={chartW} height={14}>
              <Line x1={x(0)} x2={x(0)} y1={0} y2={14} stroke={C.border} />
              <Rect x={x0} y={2} width={w} height={10} rx={2} fill={r.value >= 0 ? C.up : C.down} opacity={0.85} />
            </Svg>
            <T v="caption" style={{ width: 56, textAlign: 'right', color: r.value >= 0 ? C.up : C.down }}>{fm(r.value)}</T>
          </Row>
        );
      })}
      <Row gap={6} style={{ marginTop: 3 }}>
        <T v="caption" style={{ width: labelW, color: C.text, fontWeight: '700' }}>{totalLabel}</T>
        <Svg width={chartW} height={14}>
          <Rect x={x(Math.min(0, total))} y={1} width={Math.max(1.5, Math.abs(x(total) - x(0)))} height={12} rx={2} fill={C.accent} />
        </Svg>
        <T v="caption" style={{ width: 56, textAlign: 'right', color: C.text, fontWeight: '700' }}>{fm(total)}</T>
      </Row>
    </View>
  );
}

/** Horizontal comparison bars (e.g. economic profit by client). */
export function HBars({ rows, width }: { rows: { label: string; value: number; sub?: string; color?: string }[]; width: number }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const labelW = 86;
  const half = (width - labelW - 70) / 2;
  return (
    <View style={{ gap: 7 }}>
      {rows.map((r, i) => {
        const w = (Math.abs(r.value) / max) * half;
        return (
          <Row key={i} gap={6}>
            <T v="caption" numberOfLines={1} style={{ width: labelW, color: C.text }}>{r.label}</T>
            <Svg width={half * 2} height={16}>
              <Line x1={half} x2={half} y1={0} y2={16} stroke={C.borderStrong} />
              <Rect x={r.value >= 0 ? half : half - w} y={3} width={Math.max(1, w)} height={10} rx={2} fill={r.color ?? (r.value >= 0 ? C.up : C.down)} />
            </Svg>
            <View style={{ width: 64, alignItems: 'flex-end' }}>
              <T v="caption" color={r.value >= 0 ? C.up : C.down}>{fm(r.value)}</T>
              {r.sub ? <T v="caption" style={{ fontSize: 9.5 }}>{r.sub}</T> : null}
            </View>
          </Row>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- flow diagram

export interface FlowNode {
  id: string;
  label: string;
  sub?: string;
  x: number; // 0..1
  y: number; // 0..1
}
export interface FlowEdge {
  from: string;
  to: string;
  kind: 'cash' | 'sec';
  label: string;
  bend?: number;
}

export function FlowDiagram({ nodes, edges, width, height = 260 }: { nodes: FlowNode[]; edges: FlowEdge[]; width: number; height?: number }) {
  const nw = 96;
  const nh = 40;
  const pos = (id: string) => {
    const n = nodes.find((x) => x.id === id)!;
    return { cx: n.x * (width - nw) + nw / 2, cy: n.y * (height - nh) + nh / 2 };
  };
  return (
    <View>
      <Svg width={width} height={height}>
        {edges.map((e, i) => {
          const a = pos(e.from);
          const b = pos(e.to);
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          // trim to node boxes
          const tx = (dx / len) * (Math.abs(dx) / len > 0.6 ? nw / 2 + 4 : nh / 2 + 6);
          const ty = (dy / len) * (Math.abs(dx) / len > 0.6 ? nw / 2 + 4 : nh / 2 + 6);
          const sx = a.cx + tx;
          const sy = a.cy + ty;
          const ex = b.cx - tx;
          const ey = b.cy - ty;
          const bend = e.bend ?? (e.kind === 'cash' ? 18 : -18);
          const mx = (sx + ex) / 2 - (dy / len) * bend;
          const my = (sy + ey) / 2 + (dx / len) * bend;
          const col = e.kind === 'cash' ? C.cash : C.sec;
          // arrow head
          const ang = Math.atan2(ey - my, ex - mx);
          const ah = 7;
          const p1 = `${ex},${ey}`;
          const p2 = `${ex - ah * Math.cos(ang - 0.4)},${ey - ah * Math.sin(ang - 0.4)}`;
          const p3 = `${ex - ah * Math.cos(ang + 0.4)},${ey - ah * Math.sin(ang + 0.4)}`;
          return (
            <G key={i}>
              <Path d={`M${sx},${sy} Q${mx},${my} ${ex},${ey}`} stroke={col} strokeWidth={1.6} fill="none" strokeDasharray={e.kind === 'sec' ? '5,3' : undefined} />
              <Polygon points={`${p1} ${p2} ${p3}`} fill={col} />
              <SvgText x={mx} y={my - 3} fill={col} fontSize={9.5} fontWeight="600" textAnchor="middle" fontFamily={C_FONT}>
                {e.label}
              </SvgText>
            </G>
          );
        })}
        {nodes.map((n) => {
          const p = pos(n.id);
          return (
            <G key={n.id}>
              <Rect x={p.cx - nw / 2} y={p.cy - nh / 2} width={nw} height={nh} rx={8} fill={C.surface3} stroke={n.id === 'atlas' ? C.accent : C.borderStrong} strokeWidth={n.id === 'atlas' ? 1.5 : 1} />
              <SvgText x={p.cx} y={p.cy - (n.sub ? 2 : -4)} fill={C.text} fontSize={11} fontWeight="700" textAnchor="middle" fontFamily={C_FONT}>
                {n.label}
              </SvgText>
              {n.sub ? (
                <SvgText x={p.cx} y={p.cy + 11} fill={C.textDim} fontSize={9} textAnchor="middle" fontFamily={C_FONT}>
                  {n.sub}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      <Row gap={14} style={{ marginTop: 4 }}>
        <Row gap={5}>
          <View style={{ width: 16, height: 2, backgroundColor: C.cash }} />
          <T v="caption">Cash</T>
        </Row>
        <Row gap={5}>
          <View style={{ width: 16, height: 2, backgroundColor: C.sec }} />
          <T v="caption">Securities</T>
        </Row>
      </Row>
    </View>
  );
}
