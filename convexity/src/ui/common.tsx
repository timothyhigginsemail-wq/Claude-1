import { ReactNode, useEffect } from 'react';
import { NPCS, NpcId } from '../engine/npc';
import { CLIENTS } from '../engine/clients';
import { store } from './store';
import { fmtUsd } from '../engine/book';

export const usd = (x: number) => fmtUsd(x);
export const sgnUsd = (x: number) => (x > 0 ? '+' : '') + fmtUsd(x);
export const pnlCls = (x: number) => (x > 0.5 ? 'up' : x < -0.5 ? 'down' : 'muted');
export const pct = (x: number, dp = 2) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`;
export const kfmt = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}bn`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}m`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${s}${a.toFixed(0)}`;
};

export function Avatar({ id, size = 34 }: { id: string; size?: number }) {
  const npc = NPCS[id as NpcId];
  const client = CLIENTS.find((c) => c.id === id);
  const hue = npc ? npc.hue : client ? (id.length * 47) % 360 : 70;
  const initials = npc ? npc.initials : client ? client.name.split(' ').map((w) => w[0]).slice(0, 2).join('') : '◆';
  return (
    <div className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 30% 16%)`, color: `hsl(${hue} 75% 72%)`, boxShadow: `inset 0 0 0 1px hsl(${hue} 40% 30%)`, borderRadius: client ? 10 : '50%' }}>
      {initials}
    </div>
  );
}

export function who(id?: string): { name: string; role: string } {
  if (!id) return { name: 'Desk', role: '' };
  const n = NPCS[id as NpcId];
  if (n) return { name: n.name, role: n.role };
  const c = CLIENTS.find((x) => x.id === id);
  if (c) return { name: c.name, role: 'Client' };
  return { name: id, role: '' };
}

export function Sheet({ title, sub, onClose, children, foot, right }: { title: ReactNode; sub?: ReactNode; onClose?: () => void; children: ReactNode; foot?: ReactNode; right?: ReactNode }) {
  const close = onClose ?? (() => store.open(null));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet" role="dialog">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title">{title}</div>
            {sub && <div className="sheet-sub">{sub}</div>}
          </div>
          {right}
          <button className="iconbtn" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function LearnLink({ topic, label }: { topic: string; label?: string }) {
  return (
    <button className="pill" style={{ height: 26, fontSize: 11.5, borderColor: 'rgba(166,140,255,.4)', color: 'var(--violet)' }} onClick={() => store.learn(topic)}>
      <Icon name="spark" size={12} /> {label ?? 'Why?'}
    </button>
  );
}

export function Meter({ value, warnAt = 0.8 }: { value: number; warnAt?: number }) {
  const v = Math.max(0, Math.min(1.2, value));
  const col = value > 1 ? 'var(--down)' : value > warnAt ? 'var(--warn)' : 'var(--acc2)';
  return (
    <div className="meter">
      <i style={{ width: `${Math.min(100, v * 100)}%`, background: col }} />
    </div>
  );
}

const PATHS: Record<string, ReactNode> = {
  x: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth={3} />,
  markets: <path d="M3 17l5-6 4 3 5-8 4 5" />,
  book: <path d="M4 6h16M4 12h16M4 18h10" />,
  hedge: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4" />,
  lab: <path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3 M7.5 15h9" />,
  learn: <path d="M12 3l9 5-9 5-9-5z M6 10.5V16c2 2 10 2 12 0v-5.5" />,
  risk: <path d="M12 3v18M3 12h18M6 6l12 12" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
  chev: <path d="M9 6l6 6-6 6" />,
  pnl: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  bolt: <path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  trophy: <path d="M7 4h10v4a5 5 0 01-10 0zM5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6" />,
  sandbox: <path d="M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10" />,
  career: <path d="M4 20h16M6 20V10M12 20V4M18 20v-7" />,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill="#171714" stroke="#3a3832" />
      <path d="M6 25 Q17 25 26 7" stroke="#d7f75b" strokeWidth={3} fill="none" strokeLinecap="round" />
      <circle cx="26" cy="7" r="2.6" fill="#d7f75b" />
    </svg>
  );
}
