import { useMemo, useRef, useState } from 'react';
import { deserialize, type GameConfig, type GameState } from '../engine/game';
import { LEVELS, type Level } from '../engine/levels';
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
  onLab: (exp?: number) => void;
  onOnboarded: () => void;
}) {
  const { saved, prefs } = props;
  const [seed, setSeed] = useState(randomSeed);
  const [turns, setTurns] = useState<number | 'default' | 'endless'>('default');
  const [sandbox, setSandbox] = useState(false);
  const [sbLevel, setSbLevel] = useState<Level>(2);
  const [sbGross, setSbGross] = useState(8);
  const [sbRegimes, setSbRegimes] = useState<'auto' | 'calm' | 'full'>('full');
  const [sbTransparent, setSbTransparent] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [runsVer, setRunsVer] = useState(0);
  const runs = useMemo(() => loadRuns(), [runsVer]);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfgFor = (level: Level): GameConfig => ({
    level,
    seed: seed.trim() || randomSeed(),
    turns: turns === 'endless' ? null : turns === 'default' ? LEVELS[level].defaultTurns : turns,
    mode: 'campaign',
    transparent: false,
    startNav: 1_000_000,
  });

  const startLevel = (level: Level) => {
    props.onOnboarded();
    props.onStart(cfgFor(level));
  };

  const startSandbox = () =>
    props.onStart({
      level: sbLevel,
      seed: seed.trim() || randomSeed(),
      turns: turns === 'endless' ? null : turns === 'default' ? 40 : turns,
      mode: 'sandbox',
      transparent: sbTransparent,
      startNav: 1_000_000,
      maxGross: sbGross,
      regimes: sbRegimes,
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
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => props.onLab()}>Experiment Lab</button>
          <button className="btn btn-ghost" onClick={props.onToggleTheme} aria-label="Toggle theme">{prefs.theme === 'dark' ? '☀︎ Light' : '☾ Dark'}</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        <section className="pt-10 pb-8 grid md:grid-cols-[1.3fr_1fr] gap-8 items-center">
          <div>
            <h1 className="text-[34px] md:text-[42px] leading-[1.08] font-bold tracking-tight">
              Learn to size risk like a<br />
              <span className="text-accent">quantitative portfolio manager.</span>
            </h1>
            <p className="mt-4 text-ink2 text-[14.5px] leading-relaxed max-w-xl">
              Evaluate trades with uncertain edges, choose position sizes, build a correlated multi-strategy book, survive regime shifts and
              margin calls — then find out whether your decisions were good, or just lucky. Every market is a reproducible simulation with hidden
              true probabilities, latent risk factors and regimes.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              {saved && saved.status === 'playing' && (
                <button className="btn btn-primary" onClick={props.onContinue}>
                  Continue Level {saved.config.level} · turn {saved.turn} · {money(saved.nav)}
                </button>
              )}
              {saved && saved.status !== 'playing' && (
                <button className="btn" onClick={props.onContinue}>View last campaign review</button>
              )}
              {!saved && (
                <button className="btn btn-primary pulse" onClick={() => startLevel(1)}>
                  Start with Level 1 →
                </button>
              )}
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

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <div>
              <div className="label">Campaigns</div>
              <div className="text-ink2 text-[12.5px] mt-1">New players should start with Level 1 — it introduces the mechanics turn by turn.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <label className="flex items-center gap-1.5 text-muted">
                Seed
                <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} className="w-36 num" />
              </label>
              <button className="btn btn-ghost" onClick={() => setSeed(randomSeed())} title="New random seed">↻</button>
              <label className="flex items-center gap-1.5 text-muted">
                Length
                <select value={String(turns)} onChange={(e) => setTurns(e.target.value === 'default' || e.target.value === 'endless' ? e.target.value : Number(e.target.value))}>
                  <option value="default">Standard</option>
                  <option value="20">20 turns</option>
                  <option value="30">30 turns</option>
                  <option value="50">50 turns (extended)</option>
                  <option value="endless">Endless</option>
                </select>
              </label>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {([1, 2, 3] as Level[]).map((l) => {
              const L = LEVELS[l];
              return (
                <div key={l} className="panel p-4 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="chip">LEVEL {l}</span>
                    {l === 1 && <span className="chip" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>START HERE</span>}
                  </div>
                  <div className="font-semibold text-[16px] mt-3">{L.title}</div>
                  <p className="text-ink2 text-[12.5px] mt-1.5 leading-relaxed">{L.subtitle}</p>
                  <ul className="mt-3 space-y-1 text-[12px] text-ink2 flex-1">
                    {L.focus.map((f) => (
                      <li key={f} className="flex gap-2"><span className="text-accent">▸</span>{f}</li>
                    ))}
                  </ul>
                  <div className="text-[11px] text-muted mt-3 num">
                    {turns === 'default' ? L.defaultTurns : turns === 'endless' ? '∞' : turns} turns · max gross {L.maxGross}×{l > 1 ? ` · DD stop ${pct(L.ddStop, 0)}` : ''}
                  </div>
                  <button className={`btn mt-3 justify-center ${l === 1 ? 'btn-primary' : ''}`} onClick={() => startLevel(l)}>
                    Play Level {l}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div className="label">Free sandbox</div>
              <button className="btn btn-ghost text-[12px]" onClick={() => setSandbox(!sandbox)}>{sandbox ? 'Hide' : 'Configure'}</button>
            </div>
            <p className="text-ink2 text-[12.5px] mt-2">Choose the mechanics, regimes and leverage yourself. Optionally reveal the hidden true probabilities to study how estimates mislead (scoring is then disabled).</p>
            {sandbox && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <label className="flex flex-col gap-1 text-muted">Mechanics
                  <select value={sbLevel} onChange={(e) => setSbLevel(Number(e.target.value) as Level)}>
                    <option value={1}>Level 1 — single trade</option>
                    <option value={2}>Level 2 — portfolio</option>
                    <option value={3}>Level 3 — pods</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-muted">Regimes
                  <select value={sbRegimes} onChange={(e) => setSbRegimes(e.target.value as 'auto' | 'calm' | 'full')}>
                    <option value="full">All regimes from turn 1</option>
                    <option value="calm">Calm only</option>
                    <option value="auto">Level default</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-muted">Gross leverage cap: <span className="num text-ink">{sbGross}×</span>
                  <input type="range" min={1} max={15} step={0.5} value={sbGross} onChange={(e) => setSbGross(Number(e.target.value))} />
                </label>
                <label className="flex items-center gap-2 text-ink2 mt-4">
                  <input type="checkbox" checked={sbTransparent} onChange={(e) => setSbTransparent(e.target.checked)} />
                  Transparent mode (show true probabilities)
                </label>
                <button className="btn btn-primary col-span-2 justify-center" onClick={startSandbox}>Start sandbox</button>
              </div>
            )}
          </div>
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <div className="label">Experiment Lab</div>
              <button className="btn btn-ghost text-[12px]" onClick={() => props.onLab()}>Open →</button>
            </div>
            <p className="text-ink2 text-[12.5px] mt-2">Twelve interactive experiments on the mathematics behind the game.</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[12px]">
              {LAB_TITLES.map((t, i) => (
                <button key={t} className="text-left text-ink2 hover:text-accent truncate" onClick={() => props.onLab(i + 1)}>
                  <span className="num text-muted mr-1.5">{String(i + 1).padStart(2, '0')}</span>{t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {runs.length > 0 && <RunsTable runs={runs} onDelete={(id) => { deleteRun(id); setRunsVer((v) => v + 1); }} onReplay={(r) => props.onStart({ level: r.level, seed: r.seed, turns: r.turns, mode: 'campaign', transparent: false, startNav: 1_000_000 })} />}

        {saved && (
          <div className="mt-6 text-[11.5px] text-muted flex items-center gap-2">
            Saved campaign: Level {saved.config.level}, seed <span className="num">{saved.config.seed}</span>.
            <button className="underline hover:text-neg" onClick={() => confirm('Discard the saved campaign?') && props.onDiscard()}>Discard</button>
          </div>
        )}
      </main>
    </div>
  );
}

export const LAB_TITLES = [
  'Kelly with a 55/45 coin',
  'Fixed dollars vs fixed fraction',
  'Equal % gains and losses',
  'Arithmetic vs geometric returns',
  'Log growth vs expected wealth',
  'Marginal edge vs marginal drag',
  'Kelly with unequal payoffs',
  'Estimation uncertainty & sizing',
  'Correlated bets & hidden factors',
  'Leverage, growth & ruin',
  'Repeated independent bets',
  'Sharpe ≠ allocation',
];

function RunsTable({ runs, onDelete, onReplay }: { runs: RunSummary[]; onDelete: (id: string) => void; onReplay: (r: RunSummary) => void }) {
  return (
    <section className="panel p-4 mt-3">
      <div className="label mb-2">Completed campaigns</div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-[12px]">
          <thead className="text-muted text-left">
            <tr>
              <th className="py-1 pr-3 font-medium">Date</th>
              <th className="pr-3 font-medium">Level</th>
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
                <td className="pr-3">L{r.level}{r.mode === 'sandbox' ? ' (sandbox)' : ''}</td>
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
