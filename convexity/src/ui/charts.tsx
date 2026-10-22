// Hand-rolled SVG charts. Every chart takes real game data; nothing here invents numbers.

import { ReactNode, useLayoutEffect, useRef, useState } from 'react';

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.max(120, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    setW(Math.max(120, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const C = { ink3: '#7f7a6e', ink4: '#57534a', line: '#2a2924', acc: '#d7f75b', up: '#46dcc0', down: '#ff6b4a', violet: '#a68cff', warn: '#ffb547', ink2: '#b8b3a5' };
export const COLORS = C;

function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-12) return [lo];
  const raw = (hi - lo) / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let x = Math.ceil(lo / step) * step; x <= hi + 1e-9 * step; x += step) out.push(Math.abs(x) < step * 1e-9 ? 0 : x);
  return out;
}

export interface Series {
  data: [number, number][];
  color?: string;
  width?: number;
  dash?: string;
  fill?: boolean;
  label?: string;
  opacity?: number;
}

export function LineChart(p: {
  series: Series[];
  height?: number;
  xFmt?: (x: number) => string;
  yFmt?: (y: number) => string;
  zeroLine?: boolean;
  vlines?: { x: number; label?: string; color?: string }[];
  hlines?: { y: number; label?: string; color?: string }[];
  markers?: { x: number; y: number; color?: string; label?: string }[];
  yDomain?: [number, number];
  xDomain?: [number, number];
  legend?: boolean;
  bands?: { y0: number; y1: number; color: string }[];
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = p.height ?? 160;
  const padL = 46, padR = 8, padT = 8, padB = 20;
  const all = p.series.flatMap((s) => s.data).filter((d) => Number.isFinite(d[0]) && Number.isFinite(d[1]));
  let [x0, x1] = p.xDomain ?? [Math.min(...all.map((d) => d[0])), Math.max(...all.map((d) => d[0]))];
  let [y0, y1] = p.yDomain ?? [Math.min(...all.map((d) => d[1])), Math.max(...all.map((d) => d[1]))];
  if (p.zeroLine) {
    y0 = Math.min(y0, 0);
    y1 = Math.max(y1, 0);
  }
  for (const hl of p.hlines ?? []) {
    y0 = Math.min(y0, hl.y);
    y1 = Math.max(y1, hl.y);
  }
  if (!all.length) {
    x0 = 0; x1 = 1; y0 = 0; y1 = 1;
  }
  if (y1 - y0 < 1e-12) {
    const m = Math.abs(y0) || 1;
    y0 -= m * 0.1;
    y1 += m * 0.1;
  }
  if (x1 - x0 < 1e-12) x1 = x0 + 1;
  const pad = (y1 - y0) * 0.08;
  if (!p.yDomain) {
    y0 -= pad;
    y1 += pad;
  }
  const X = (x: number) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR);
  const Y = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (h - padT - padB);
  const yt = niceTicks(y0, y1, 4);
  const xt = niceTicks(x0, x1, w < 360 ? 3 : 5);
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {(p.bands ?? []).map((b, i) => (
          <rect key={i} x={padL} width={w - padL - padR} y={Y(Math.max(b.y0, b.y1))} height={Math.abs(Y(b.y0) - Y(b.y1))} fill={b.color} />
        ))}
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={t === 0 && p.zeroLine ? C.ink4 : C.line} strokeWidth={1} />
            <text x={padL - 6} y={Y(t) + 3} textAnchor="end">
              {p.yFmt ? p.yFmt(t) : t.toFixed(2)}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={`x${t}`} x={X(t)} y={h - 5} textAnchor="middle">
            {p.xFmt ? p.xFmt(t) : t.toFixed(1)}
          </text>
        ))}
        {(p.vlines ?? []).map((v, i) => (
          <g key={`v${i}`}>
            <line x1={X(v.x)} x2={X(v.x)} y1={padT} y2={h - padB} stroke={v.color ?? C.ink4} strokeDasharray="3 3" />
            {v.label && (
              <text x={X(v.x) + 3} y={padT + 9} style={{ fill: v.color ?? C.ink3 }}>
                {v.label}
              </text>
            )}
          </g>
        ))}
        {(p.hlines ?? []).map((v, i) => (
          <g key={`h${i}`}>
            <line x1={padL} x2={w - padR} y1={Y(v.y)} y2={Y(v.y)} stroke={v.color ?? C.ink4} strokeDasharray="4 3" />
            {v.label && (
              <text x={w - padR - 2} y={Y(v.y) - 3} textAnchor="end" style={{ fill: v.color ?? C.ink3 }}>
                {v.label}
              </text>
            )}
          </g>
        ))}
        {p.series.map((s, i) => {
          const pts = s.data.filter((d) => Number.isFinite(d[1]));
          if (!pts.length) return null;
          const d = pts.map((q, k) => `${k ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('');
          const col = s.color ?? C.acc;
          return (
            <g key={i} opacity={s.opacity ?? 1}>
              {s.fill && <path d={`${d}L${X(pts[pts.length - 1][0])},${Y(Math.max(y0, Math.min(0, y1)))}L${X(pts[0][0])},${Y(Math.max(y0, Math.min(0, y1)))}Z`} fill={col} opacity={0.1} />}
              <path d={d} fill="none" stroke={col} strokeWidth={s.width ?? 1.8} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {(p.markers ?? []).map((m, i) => (
          <g key={`m${i}`}>
            <circle cx={X(m.x)} cy={Y(m.y)} r={4} fill={m.color ?? C.acc} stroke="#0b0b0a" strokeWidth={2} />
            {m.label && (
              <text x={X(m.x) + 7} y={Y(m.y) - 6} style={{ fill: m.color ?? C.acc }}>
                {m.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {p.legend && (
        <div className="legend">
          {p.series.filter((s) => s.label).map((s, i) => (
            <span key={i}>
              <i style={{ background: s.color ?? C.acc }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ data, color, height = 28, width = 90, base }: { data: number[]; color?: string; height?: number; width?: number; base?: number }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const lo = Math.min(...data, base ?? Infinity);
  const hi = Math.max(...data, base ?? -Infinity);
  const r = hi - lo || 1;
  const pts = data.map((y, i) => `${((i / (data.length - 1)) * width).toFixed(1)},${(height - 2 - ((y - lo) / r) * (height - 4)).toFixed(1)}`).join(' ');
  const col = color ?? (data[data.length - 1] >= (base ?? data[0]) ? C.up : C.down);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {base !== undefined && <line x1={0} x2={width} y1={height - 2 - ((base - lo) / r) * (height - 4)} y2={height - 2 - ((base - lo) / r) * (height - 4)} stroke={C.ink4} strokeDasharray="2 3" />}
      <polyline points={pts} fill="none" stroke={col} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal bars with signed values (waterfall-like attribution). */
export function SignedBars({ items, fmt }: { items: { label: string; value: number; note?: string; onClick?: () => void }[]; fmt: (x: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="col" style={{ gap: 7 }}>
      {items.map((it) => (
        <button key={it.label} onClick={it.onClick} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 76px', alignItems: 'center', gap: 8, textAlign: 'left' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{it.label}</span>
          <span style={{ position: 'relative', height: 14 }}>
            <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: C.ink4 }} />
            <span
              style={{
                position: 'absolute',
                top: 2,
                height: 10,
                borderRadius: 3,
                background: it.value >= 0 ? C.up : C.down,
                left: it.value >= 0 ? '50%' : `${50 - (Math.abs(it.value) / max) * 50}%`,
                width: `${(Math.abs(it.value) / max) * 50}%`,
                opacity: 0.85,
              }}
            />
          </span>
          <span className={`mono ${it.value >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12.5, textAlign: 'right' }}>
            {fmt(it.value)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Heatmap({ rows, cols, values, fmt, rowLabel, colLabel, diverging = true, highlight }: { rows: string[]; cols: string[]; values: number[][]; fmt: (x: number) => string; rowLabel?: string; colLabel?: string; diverging?: boolean; highlight?: [number, number] }) {
  const max = Math.max(1e-9, ...values.flat().map((v) => Math.abs(v)));
  const lo = Math.min(...values.flat());
  const hi = Math.max(...values.flat());
  const bg = (v: number) => {
    if (diverging) {
      const a = Math.min(1, Math.abs(v) / max);
      return v >= 0 ? `rgba(70,220,192,${0.08 + 0.55 * a})` : `rgba(255,107,74,${0.08 + 0.6 * a})`;
    }
    const a = (v - lo) / (hi - lo || 1);
    return `rgba(215,247,91,${0.06 + 0.6 * a})`;
  };
  return (
    <div className="scrollx">
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ color: 'var(--ink4)', fontWeight: 500, fontSize: 10, textAlign: 'left' }}>{rowLabel}{colLabel ? ` \\ ${colLabel}` : ''}</th>
            {cols.map((c) => (
              <th key={c} style={{ color: 'var(--ink3)', fontWeight: 500, fontFamily: 'var(--mono)', fontSize: 10.5 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <td style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{r}</td>
              {cols.map((c, j) => (
                <td key={c} style={{ background: bg(values[i][j]), borderRadius: 6, textAlign: 'center', padding: '7px 2px', fontFamily: 'var(--mono)', color: 'var(--ink)', outline: highlight && highlight[0] === i && highlight[1] === j ? '1px solid var(--acc)' : undefined }}>
                  {fmt(values[i][j])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Histogram({ bins, lo, hi, marks, fmt, height = 120, colorFn }: { bins: number[]; lo: number; hi: number; marks?: { x: number; label: string; color?: string }[]; fmt: (x: number) => string; height?: number; colorFn?: (x: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = bins.length;
  const max = Math.max(1, ...bins);
  const padB = 18;
  const X = (x: number) => ((x - lo) / (hi - lo || 1)) * w;
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        {bins.map((b, i) => {
          const x = (i / n) * w;
          const bh = (b / max) * (height - padB - 6);
          const mid = lo + ((i + 0.5) / n) * (hi - lo);
          return <rect key={i} x={x + 0.5} width={w / n - 1} y={height - padB - bh} height={bh} rx={1.5} fill={colorFn ? colorFn(mid) : mid < 0 ? C.down : C.up} opacity={0.75} />;
        })}
        {(marks ?? []).map((m, i) => (
          <g key={i}>
            <line x1={X(m.x)} x2={X(m.x)} y1={4} y2={height - padB} stroke={m.color ?? C.acc} strokeDasharray="3 2" />
            <text x={Math.min(w - 4, Math.max(4, X(m.x)))} y={12 + i * 11} textAnchor={X(m.x) > w / 2 ? 'end' : 'start'} style={{ fill: m.color ?? C.acc }}>
              {m.label}
            </text>
          </g>
        ))}
        <text x={2} y={height - 4}>{fmt(lo)}</text>
        <text x={w - 2} y={height - 4} textAnchor="end">{fmt(hi)}</text>
      </svg>
    </div>
  );
}

export function Bars({ data, height = 110, fmt, labels }: { data: number[]; height?: number; fmt: (x: number) => string; labels?: string[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const max = Math.max(1e-9, ...data.map(Math.abs));
  const n = Math.max(1, data.length);
  const mid = (height - 16) / 2;
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={height}>
        <line x1={0} x2={w} y1={mid} y2={mid} stroke={C.ink4} />
        {data.map((v, i) => {
          const bh = (Math.abs(v) / max) * (mid - 4);
          return <rect key={i} x={(i / n) * w + 1} width={Math.max(2, w / n - 2)} y={v >= 0 ? mid - bh : mid} height={bh} rx={2} fill={v >= 0 ? C.up : C.down} opacity={0.8} />;
        })}
        {labels && labels.map((l, i) => (i % Math.ceil(n / 8) === 0 ? <text key={i} x={(i / n) * w + w / n / 2} y={height - 3} textAnchor="middle">{l}</text> : null))}
        <text x={w - 2} y={10} textAnchor="end">{fmt(max)}</text>
      </svg>
    </div>
  );
}

export function Ring({ value, size = 34, stroke = 3, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a2924" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? C.acc} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s linear' }} />
      </svg>
      {children}
    </div>
  );
}
