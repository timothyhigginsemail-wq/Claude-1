import type { ReactNode } from 'react';
import { Collapse } from '../ui/kit';

export function Slider({ label, value, min, max, step, onChange, fmt }: { label: ReactNode; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[12px] mb-0.5">
        <span className="text-ink2">{label}</span>
        <span className="num font-semibold">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Readout({ items }: { items: { label: string; value: string; tone?: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((it) => (
        <div key={it.label} className="bg-panel2 rounded-md px-2.5 py-2" title={it.hint}>
          <div className="text-[10px] uppercase tracking-wider text-muted">{it.label}</div>
          <div className={`num text-[14px] font-semibold ${it.tone ?? ''}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Explain({ children, math }: { children: ReactNode; math?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="prose-ec text-[13px]">{children}</div>
      {math && <Collapse title="Show the mathematics">{<div className="prose-ec text-[12.5px]">{math}</div>}</Collapse>}
    </div>
  );
}

export function Layout({ controls, chart, readout, explain, compact }: { controls: ReactNode; chart: ReactNode; readout?: ReactNode; explain?: ReactNode; compact?: boolean }) {
  return (
    <div className={`grid gap-4 ${compact ? 'md:grid-cols-[230px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>
      <div className="space-y-3">{controls}</div>
      <div className="space-y-3 min-w-0">
        {chart}
        {readout}
        {explain}
      </div>
    </div>
  );
}
