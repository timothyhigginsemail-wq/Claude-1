import type { ReactNode } from 'react';

export const AXIS = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--muted)', fontSize: 10.5, fontFamily: 'var(--font-mono)' },
  tickLine: false,
} as const;

export const GRID = { stroke: 'var(--grid)', strokeDasharray: '0', vertical: false } as const;

export const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

interface TipItem {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}
interface TipProps {
  active?: boolean;
  payload?: readonly TipItem[];
  label?: unknown;
}

export function makeTooltip(fmtLabel: (l: string | number | undefined) => ReactNode, fmtValue: (v: number, key: string) => ReactNode) {
  // Range areas pass [lo, hi] arrays; show them as "lo – hi".
  const show = (v: unknown, k: string): ReactNode => (Array.isArray(v) ? <>{fmtValue(Number(v[0]), k)} – {fmtValue(Number(v[1]), k)}</> : fmtValue(Number(v), k));
  return function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload?.length) return null;
    return (
      <div className="panel px-2.5 py-2 shadow-lg text-[11.5px]" style={{ minWidth: 140 }}>
        <div className="text-muted mb-1 num">{fmtLabel(label as string | number | undefined)}</div>
        {payload
          .filter((p) => p.value !== undefined && p.value !== null && !(typeof p.value === 'number' && !isFinite(p.value)) && !String(p.dataKey).startsWith('_'))
          .map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink2">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.color }} />
                {String(p.name ?? '')}
              </span>
              <span className="num text-ink">{show(p.value, String(p.dataKey))}</span>
            </div>
          ))}
      </div>
    );
  };
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink2">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3.5"
            style={{ height: 0, borderTop: `2px ${it.dash ? 'dashed' : 'solid'} ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Diverging colour for a value in [-1, 1] (correlation heatmaps). */
export function divergingColor(v: number): string {
  const a = Math.min(1, Math.abs(v));
  const pole = v >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
  return `color-mix(in oklab, ${pole} ${Math.round(a * 100)}%, var(--div-mid))`;
}
