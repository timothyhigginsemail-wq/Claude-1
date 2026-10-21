import { useState } from 'react';
import type { AllocConfig, AllocState } from '../engine/allocator';
import type { Prefs } from './storage';
import { money, pct } from './format';

function randomSeed() {
  const words = ['amber', 'basalt', 'cobalt', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'iris', 'jade', 'kestrel', 'lumen', 'meridian', 'nimbus', 'onyx', 'quartz', 'raven', 'sierra', 'tundra', 'umber', 'vertex', 'willow', 'zephyr'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

export { randomSeed };

export function Home(props: {
  saved: AllocState | null;
  loadError?: string;
  prefs: Prefs;
  onToggleTheme: () => void;
  onContinue: () => void;
  onStart: (cfg: AllocConfig) => void;
  onDiscard: () => void;
}) {
  const { saved } = props;
  const [seed, setSeed] = useState(randomSeed);
  const [rounds, setRounds] = useState('12');
  const [targetVol, setTargetVol] = useState(0.08);
  const [payout, setPayout] = useState(0.18);
  const [platformStop, setPlatformStop] = useState(0.1);

  const start = () =>
    props.onStart({
      seed: seed.trim() || randomSeed(),
      nav0: 1e9,
      targetVol,
      payout,
      platformStop,
      maxGross: 3,
      rounds: rounds === 'open' ? null : Number(rounds),
    });

  return (
    <div className="min-h-full">
      <header className="max-w-5xl mx-auto px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="font-bold text-[17px] tracking-tight">Edgecraft</div>
            <div className="text-[11px] text-muted -mt-0.5">The Allocator</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={props.onToggleTheme} aria-label="Toggle theme">{props.prefs.theme === 'dark' ? '☀︎ Light' : '☾ Dark'}</button>
      </header>
      <main className="max-w-5xl mx-auto px-4 pb-16">
        <section className="pt-10 pb-8 max-w-2xl">
          <h1 className="text-[34px] md:text-[40px] leading-[1.08] font-bold tracking-tight">
            You run a $1bn multi-manager platform.<br />
            <span className="text-accent">Decide who gets risk.</span>
          </h1>
          <p className="mt-4 text-ink2 text-[14.5px] leading-relaxed">
            PMs pitch with real but survivorship-selected track records. You give each a risk budget and a stop, then the market runs
            4–8 weeks. PMs keep their capital until they hit their stop or you redeem them. You pay them on their own profits, even when the
            platform loses. At the end you learn their true skill — and whether your selection, sizing and stops added anything.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {saved && saved.status === 'playing' ? (
              <>
                <button className="btn btn-primary" onClick={props.onContinue}>Continue · week {saved.week} · {money(saved.book.cash)}</button>
                <button className="btn" onClick={start}>Start a new platform</button>
              </>
            ) : (
              <button className="btn btn-primary pulse" onClick={start}>Open the platform →</button>
            )}
            {saved && saved.status !== 'playing' && <button className="btn" onClick={props.onContinue}>View last review</button>}
          </div>
          {props.loadError && <div className="mt-2 text-[12px] text-muted">An older save could not be loaded ({props.loadError}); starting fresh.</div>}
        </section>

        <section className="panel p-4">
          <div className="label mb-3">Platform mandate</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 text-[12px]">
            <label className="flex flex-col gap-1 text-muted">Seed (same seed = same market and PMs)
              <div className="flex gap-1">
                <input id="seed" type="text" value={seed} onChange={(e) => setSeed(e.target.value)} className="num flex-1 min-w-0" />
                <button className="btn btn-ghost" onClick={() => setSeed(randomSeed())} title="New random seed">↻</button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-muted">Length
              <select id="rounds" value={rounds} onChange={(e) => setRounds(e.target.value)}>
                <option value="8">8 allocation meetings</option>
                <option value="12">12 meetings (~1.5 years)</option>
                <option value="20">20 meetings (~2.5 years)</option>
                <option value="open">Open-ended</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-muted">Target volatility: <span className="num text-ink">{pct(targetVol, 0)}</span>
              <input id="tv" type="range" min={0.04} max={0.15} step={0.01} value={targetVol} onChange={(e) => setTargetVol(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-muted">PM payout: <span className="num text-ink">{pct(payout, 0)} of profits</span>
              <input id="payout" type="range" min={0.1} max={0.3} step={0.01} value={payout} onChange={(e) => setPayout(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-muted">Platform risk cut at: <span className="num text-ink">{pct(platformStop, 0)} drawdown</span>
              <input id="pstop" type="range" min={0.05} max={0.2} step={0.01} value={platformStop} onChange={(e) => setPlatformStop(Number(e.target.value))} />
            </label>
          </div>
        </section>

        {saved && (
          <div className="mt-6 text-[11.5px] text-muted flex items-center gap-2">
            Saved platform: seed <span className="num">{saved.config.seed}</span>.
            <button className="underline hover:text-neg" onClick={props.onDiscard}>Discard</button>
          </div>
        )}
      </main>
    </div>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--panel-2)" stroke="var(--border)" />
      <path d="M6 23 L12.5 15 L17.5 18.5 L26 8" stroke="var(--accent)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="8" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

