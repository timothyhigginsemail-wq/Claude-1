import { useState } from 'react';
import { EXPERIMENTS } from './experiments';
import { Logo } from '../ui/Home';

export function Lab({ initial, onExit, onToggleTheme, theme, backLabel }: { initial?: number; onExit: () => void; onToggleTheme: () => void; theme: 'dark' | 'light'; backLabel: string }) {
  const [id, setId] = useState(initial ?? 1);
  const exp = EXPERIMENTS.find((e) => e.id === id) ?? EXPERIMENTS[0];
  const Comp = exp.Component;
  return (
    <div className="min-h-full">
      <header className="border-b border-line sticky top-0 z-20" style={{ background: 'color-mix(in oklab, var(--bg) 90%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="px-4 py-2.5 flex items-center gap-3">
          <Logo size={26} />
          <div className="font-semibold">Experiment Lab</div>
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onToggleTheme}>{theme === 'dark' ? '☀︎' : '☾'}</button>
          <button className="btn" onClick={onExit}>← {backLabel}</button>
        </div>
      </header>
      <div className="grid md:grid-cols-[250px_minmax(0,1fr)] gap-4 p-4 max-w-[1400px] mx-auto">
        <nav className="space-y-1 md:sticky md:top-[64px] self-start">
          <select className="md:hidden w-full" value={id} onChange={(e) => setId(Number(e.target.value))}>
            {EXPERIMENTS.map((e) => <option key={e.id} value={e.id}>{e.id}. {e.title}</option>)}
          </select>
          <div className="hidden md:block space-y-1">
            {EXPERIMENTS.map((e) => (
              <button key={e.id} onClick={() => setId(e.id)} className="w-full text-left rounded-md px-2.5 py-2 border" style={{ borderColor: e.id === id ? 'var(--accent)' : 'transparent', background: e.id === id ? 'var(--accent-soft)' : 'transparent' }}>
                <div className="text-[12.5px] font-semibold"><span className="num text-muted mr-1.5">{String(e.id).padStart(2, '0')}</span>{e.title}</div>
                <div className="text-[11px] text-muted leading-snug mt-0.5">{e.blurb}</div>
              </button>
            ))}
          </div>
        </nav>
        <main className="panel p-4 min-w-0">
          <div className="mb-4">
            <div className="label">Experiment {exp.id} of {EXPERIMENTS.length}</div>
            <h1 className="text-[20px] font-semibold mt-0.5">{exp.title}</h1>
            <div className="text-ink2 text-[13px]">{exp.blurb}</div>
          </div>
          <Comp key={exp.id} />
          <div className="flex justify-between mt-6 pt-3 border-t border-line">
            <button className="btn" disabled={id <= 1} onClick={() => setId(id - 1)}>← Previous</button>
            <button className="btn" disabled={id >= EXPERIMENTS.length} onClick={() => setId(id + 1)}>Next →</button>
          </div>
        </main>
      </div>
    </div>
  );
}
