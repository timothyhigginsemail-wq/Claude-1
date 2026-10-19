import { useMemo, useRef, useState } from 'react';
import { SCENARIOS, deserialize, type GameConfig, type GameState, type ScenarioId } from '../engine/game';
import { LEVELS } from '../engine/levels';
import { deleteRun, loadRuns, type Prefs, type RunSummary } from './storage';
import { money, pct } from './format';
import { GradeBadge } from './kit';
import { scoreLetter } from '../engine/score';

function randomSeed() {
  const words = ['amber', 'basalt', 'cobalt', 'delta', 'ember', 'fjord', 'granite', 'harbor', 'iris', 'jade', 'kestrel', 'lumen', 'meridian', 'nimbus', 'onyx', 'quartz', 'raven', 'sierra', 'tundra', 'umber', 'vertex', 'willow', 'zephyr'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function Home(props: {
  saved: GameState | null;
  loadError?: string;
  prefs: Prefs;
  onToggleTheme: () => void;
  onContinue: () => void;
  onStart: (cfg: GameConfig) => void;
  onLoad: (s: GameState) => void;
  onDiscard: () => void;
}) {
  const { saved, prefs } = props;
  const [seed, setSeed] = useState(randomSeed);
  const [turns, setTurns] = useState<string>('endless');
  const [gross, setGross] = useState(LEVELS[3].maxGross);
  const [transparent, setTransparent] = useState(false);
  const [holdMode, setHoldMode] = useState<'pct' | 'usd'>('pct');
  const [scenario, setScenario] = useState<ScenarioId>('none');
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [runsVer, setRunsVer] = useState(0);
  const runs = useMemo(() => loadRuns(), [runsVer]);
  const fileRef = useRef<HTMLInputElement>(null);

  const start = (s = seed) =>
    props.onStart({
      level: 3,
      seed: s.trim() || randomSeed(),
      turns: turns === 'endless' ? null : Number(turns),
      mode: 'sandbox',
      transparent,
      startNav: 1_000_000,
      maxGross: gross,
      regimes: 'auto',
      holdMode,
      scenario,
    });

  return (
    <div className="min-h-full">
      <header className="max-w-6xl mx-auto px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="font-bold text-[17px] tracking-tight">Edgecraft</div>
            <div className="text-[11px] text-muted -mt-0.5">The Portfolio Lab</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={props.onToggleTheme} aria-label="Toggle theme">{prefs.theme === 'dark' ? '☀︎ Light' : '☾ Dark'}</button>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        <section className="pt-10 pb-8 grid md:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div>
            <h1 className="text-[34px] md:text-[42px] leading-[1.08] font-bold tracking-tight">
              Run a multi-strategy book.<br />
              <span className="text-accent">Size it like a quant.</span>
            </h1>
            <p className="mt-4 text-ink2 text-[14.5px] leading-relaxed max-w-xl">
              Every week brings new trades and seven strategy pods to allocate to. Put on as many positions as you like from one blotter,
              advance the market, and watch correlated factors, regime shifts and margin calls play out. Edges are estimated, not known —
              the review at the end shows how much was skill.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              {saved && saved.status === 'playing' ? (
                <>
                  <button className="btn btn-primary" onClick={props.onContinue}>Continue · week {saved.turn} · {money(saved.nav)}</button>
                  <button className="btn" onClick={() => start()}>Start a new session</button>
                </>
              ) : (
                <button className="btn btn-primary pulse" onClick={() => start()}>Start free play →</button>
              )}
              {saved && saved.status !== 'playing' && <button className="btn" onClick={props.onContinue}>View last review</button>}
              <button className="btn" onClick={() => fileRef.current?.click()}>Load save file…</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    props.onLoad(deserialize(await f.text()));
                  } catch (err) {
                    setFileErr((err as Error).message);
                  }
                }}
              />
            </div>
            {(props.loadError || fileErr) && <div className="mt-2 text-neg text-[12px]">Could not load save: {props.loadError ?? fileErr}</div>}
          </div>
          <HeroChart />
        </section>

        <section className="panel p-4">
          <div className="label mb-3">Session settings</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[12px]">
            <label className="flex flex-col gap-1 text-muted">Seed (same seed = same market)
              <div className="flex gap-1">
                <input id="seed" type="text" value={seed} onChange={(e) => setSeed(e.target.value)} className="num flex-1 min-w-0" />
                <button className="btn btn-ghost" onClick={() => setSeed(randomSeed())} title="New random seed">↻</button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-muted">Length
              <select id="length" value={turns} onChange={(e) => setTurns(e.target.value)}>
                <option value="endless">Open-ended (finish any time)</option>
                <option value="20">20 weeks</option>
                <option value="40">40 weeks</option>
                <option value="60">60 weeks</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-muted">Gross leverage cap: <span className="num text-ink">{gross}×</span>
              <input id="gross" type="range" min={1} max={12} step={0.5} value={gross} onChange={(e) => setGross(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-muted">Holding style
              <select id="holdmode" value={holdMode} onChange={(e) => setHoldMode(e.target.value as 'pct' | 'usd')}>
                <option value="pct">Fixed % of NAV (rebalance weekly)</option>
                <option value="usd">Fixed dollars (let it drift)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-muted sm:col-span-2">Market
              <select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
                {(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => <option key={k} value={k}>{k === 'none' ? SCENARIOS[k].name : `Drill: ${SCENARIOS[k].name}`}</option>)}
              </select>
              <span className="text-[11px] text-ink2">{SCENARIOS[scenario].desc}</span>
            </label>
            <label className="flex items-center gap-2 text-ink2 sm:mt-4">
              <input id="transparent" type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              Show true probabilities (practice mode)
            </label>
          </div>
        </section>

        {runs.length > 0 && <RunsTable runs={runs} onDelete={(id) => { deleteRun(id); setRunsVer((v) => v + 1); }} onReplay={(r) => start(r.seed)} />}

        {saved && (
          <div className="mt-6 text-[11.5px] text-muted flex items-center gap-2">
            Saved session: seed <span className="num">{saved.config.seed}</span>.
            <button className="underline hover:text-neg" onClick={props.onDiscard}>Discard</button>
          </div>
        )}
      </main>
    </div>
  );
}

function RunsTable({ runs, onDelete, onReplay }: { runs: RunSummary[]; onDelete: (id: string) => void; onReplay: (r: RunSummary) => void }) {
  return (
    <section className="panel p-4 mt-3">
      <div className="label mb-2">Finished sessions</div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-[12px]">
          <thead className="text-muted text-left">
            <tr>
              <th className="py-1 pr-3 font-medium">Date</th>
              <th className="pr-3 font-medium">Length</th>
              <th className="pr-3 font-medium">Seed</th>
              <th className="pr-3 font-medium text-right">Final NAV</th>
              <th className="pr-3 font-medium text-right">Max DD</th>
              <th className="pr-3 font-medium text-right">Sharpe</th>
              <th className="pr-3 font-medium text-center">Decisions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 15).map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1.5 pr-3 text-ink2">{new Date(r.date).toLocaleDateString()}</td>
                <td className="pr-3">{r.turns} wk</td>
                <td className="pr-3 num">{r.seed}</td>
                <td className={`pr-3 num text-right ${r.finalNav >= 1e6 ? 'text-pos' : 'text-neg'}`}>{money(r.finalNav)}</td>
                <td className="pr-3 num text-right">{pct(r.maxDD)}</td>
                <td className="pr-3 num text-right">{r.sharpe.toFixed(2)}</td>
                <td className="pr-3 text-center"><GradeBadge letter={scoreLetter(r.decisionScore)} size="sm" /></td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn btn-ghost text-[11.5px]" onClick={() => onReplay(r)}>Replay seed</button>
                  <button className="btn btn-ghost text-[11.5px]" onClick={() => onDelete(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

/** Decorative-but-true hero: growth vs exposure for a 55/45 coin (computed, not drawn). */
function HeroChart() {
  const pts = useMemo(() => {
    const out: { f: number; g: number; m: number }[] = [];
    for (let i = 0; i <= 50; i++) {
      const f = (i / 50) * 0.25;
      out.push({ f, g: 0.55 * Math.log(1 + f) + 0.45 * Math.log(1 - f), m: 0.1 * f });
    }
    return out;
  }, []);
  const W = 360, H = 200, pad = 26;
  const x = (f: number) => pad + (f / 0.25) * (W - 2 * pad);
  const gmin = -0.012, gmax = 0.026;
  const y = (g: number) => H - pad - ((g - gmin) / (gmax - gmin)) * (H - 2 * pad);
  const path = (k: 'g' | 'm') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.f).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  return (
    <div className="panel p-4">
      <div className="label">55/45 even-money bet</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label="Expected profit rises linearly with bet size while expected log growth peaks at 10% and turns negative past 20%">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--axis)" />
        <line x1={x(0.1)} x2={x(0.1)} y1={pad - 6} y2={H - pad} stroke="var(--muted)" strokeDasharray="3 3" />
        <path d={path('m')} stroke="var(--c2)" strokeWidth={2} fill="none" />
        <path d={path('g')} stroke="var(--c1)" strokeWidth={2.4} fill="none" />
        <text x={x(0.1) + 4} y={pad + 2} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">Kelly 10%</text>
        <text x={x(0.2) + 2} y={y(0) - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">2× Kelly ≈ 0</text>
        {[0, 0.05, 0.1, 0.15, 0.2, 0.25].map((f) => (
          <text key={f} x={x(f)} y={H - 8} fontSize="9.5" fill="var(--muted)" textAnchor="middle" fontFamily="var(--font-mono)">{(f * 100).toFixed(0)}%</text>
        ))}
      </svg>
      <div className="flex gap-4 text-[11px] text-ink2 mt-1">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2" style={{ borderColor: 'var(--c2)' }} />Expected profit per bet</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t-2" style={{ borderColor: 'var(--c1)' }} />Expected log growth (what compounds)</span>
      </div>
      <div className="text-[11px] text-muted mt-1">x-axis: fraction of wealth bet</div>
    </div>
  );
}
