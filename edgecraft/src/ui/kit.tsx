import { useEffect, useState, type ReactNode } from 'react';

export function Panel({ title, right, children, className = '', bodyClass = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel flex flex-col min-h-0 ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
          <div className="label">{title}</div>
          <div className="flex items-center gap-1">{right}</div>
        </header>
      )}
      <div className={`px-3 pb-3 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, title }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="label truncate">{label}</div>
      <div className={`num text-[15px] font-semibold leading-tight mt-0.5 ${tone ?? ''}`}>{value}</div>
      {sub !== undefined && <div className="text-[11px] text-muted num truncate">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={`flex gap-1 border-b border-line overflow-x-auto scroll-thin ${className}`}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/55 backdrop-blur-[2px] p-2 md:p-6 overflow-y-auto" onMouseDown={onClose}>
      <div
        className={`panel fade-up w-full ${wide ? 'max-w-6xl' : 'max-w-2xl'} max-h-[94vh] flex flex-col shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <div className="font-semibold text-[15px]">{title}</div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto scroll-thin p-4 min-h-0">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Collapse({ title, children, defaultOpen = false, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line rounded-lg">
      <button className="w-full flex items-center justify-between px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span className="font-semibold text-[12.5px] flex items-center gap-2">
          <span className="text-muted inline-block w-3">{open ? '▾' : '▸'}</span>
          {title}
        </span>
        {right}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function Bar({ value, max, tone = 'var(--accent)', height = 6, center = false }: { value: number; max: number; tone?: string; height?: number; center?: boolean }) {
  const frac = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  if (center) {
    return (
      <div className="relative w-full rounded-full" style={{ height, background: 'var(--panel-2)' }}>
        <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'var(--axis)' }} />
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{ background: tone, width: `${frac * 50}%`, left: value >= 0 ? '50%' : `${50 - frac * 50}%` }}
        />
      </div>
    );
  }
  return (
    <div className="w-full rounded-full" style={{ height, background: 'var(--panel-2)' }}>
      <div className="rounded-full h-full" style={{ width: `${frac * 100}%`, background: tone }} />
    </div>
  );
}

export function Info({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-line text-[9px] text-muted cursor-help align-middle ml-1" title={text}>
      ?
    </span>
  );
}

export function GradeBadge({ letter, size = 'md' }: { letter: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = letter === 'A' ? 'var(--pos-fill)' : letter === 'B' ? 'var(--c1)' : letter === 'C' ? 'var(--warn)' : 'var(--neg-fill)';
  const dim = size === 'lg' ? 'w-14 h-14 text-2xl' : size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-9 h-9 text-base';
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold num ${dim}`} style={{ border: `2px solid ${color}`, color }}>
      {letter}
    </span>
  );
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function MathBlock({ children }: { children: ReactNode }) {
  return <div className="num text-[12px] bg-panel2 border border-line rounded-md px-3 py-2 my-2 whitespace-pre-wrap leading-relaxed text-ink2">{children}</div>;
}

export function useMediaQuery(q: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : true);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}
