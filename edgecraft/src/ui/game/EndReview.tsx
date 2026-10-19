import { useEffect, useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BENCH_IDS, BENCH_INFO, topRegime, type GameConfig, type GameState, type TurnRecord } from '../../engine/game';
import { REGIMES, REGIME_SPECS } from '../../engine/market';
import { scorecard } from '../../engine/score';
import { AXIS, GRID, Legend, SERIES, makeTooltip } from '../charts';
import { Bar, GradeBadge, Panel } from '../kit';
import { money, num, pct, signedMoney, signedPct, toneClass } from '../format';
import { Logo } from '../Home';
import { loadRuns, saveRun } from '../storage';
import { Ghosts, Performance, SkillVsLuck } from './Bottom';
import { ResolutionModal } from './Resolution';
import { WhyModal } from './Why';
import type { WhyTopic } from '../content';
import { scoreLetter } from '../../engine/score';

export function EndReview(props: {
  state: GameState;
  onHome: () => void;
  onReplay: (cfg: GameConfig) => void;
  onToggleTheme: () => void;
  onOpenRecord: (r: TurnRecord) => void;
  reviewRecord: TurnRecord | null;
  closeReview: () => void;
  onWhy: (t: WhyTopic) => void;
  why: WhyTopic | null;
  closeWhy: () => void;
}) {
  const { state } = props;
  const sc = useMemo(() => scorecard(state), [state]);
  const runId = `${state.config.seed}-L${state.config.level}-${state.config.mode}-${state.history.length}-${Math.round(state.nav)}`;

  useEffect(() => {
    saveRun({
      id: runId,
      seed: state.config.seed,
      level: state.config.level,
      mode: state.config.mode,
      date: new Date().toISOString(),
      label: `L${state.config.level} ${state.config.seed}`,
      turns: state.config.turns ?? state.history.length,
      finalNav: state.nav,
      navPath: state.navPath,
      decisionScore: sc.avgDecision,
      maxDD: sc.maxDD,
      sharpe: sc.sharpe,
      status: state.status,
    });
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sameSeed = useMemo(() => loadRuns().filter((r) => r.seed === state.config.seed && r.level === state.config.level && r.id !== runId).slice(0, 5), [runId, state.config]);
  const replayCfg: GameConfig = { ...state.config };
  const d = sc.decomposition;
  const transparentNote = state.config.transparent ? ' (transparent sandbox — not scored)' : '';

  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo size={26} />
          <div className="font-semibold">Investment Committee Review</div>
          <span className="chip">L{state.config.level} · seed {state.config.seed}{transparentNote}</span>
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={props.onToggleTheme}>◐</button>
          <button className="btn" onClick={props.onHome}>Home</button>
          <button className="btn" onClick={() => props.onReplay(replayCfg)}>Replay same seed</button>
          <button className="btn btn-primary" onClick={() => props.onReplay({ ...replayCfg, seed: `${replayCfg.seed}-${Math.floor(Math.random() * 900 + 100)}` })}>New session</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        {state.status === 'closed' && (
          <div className="panel p-3 text-neg font-semibold" style={{ borderColor: 'var(--neg)' }}>Fund closed: {state.closedReason}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <Big label="Final NAV" value={money(sc.finalNav)} tone={toneClass(sc.totalReturn)} />
          <Big label="Total return" value={signedPct(sc.totalReturn)} tone={toneClass(sc.totalReturn)} />
          <Big label="CAGR" value={signedPct(sc.cagr)} />
          <Big label="Sharpe (ann.)" value={num(sc.sharpe, 2)} />
          <Big label="Max drawdown" value={pct(sc.maxDD)} tone={sc.maxDD > 0.2 ? 'text-neg' : ''} />
          <Big label="Worst week / ES95" value={`${pct(sc.worstWeek)} / ${pct(sc.es95Week)}`} />
          <div className="panel p-3 flex items-center gap-3">
            <GradeBadge letter={sc.decisionLetter} size="lg" />
            <div><div className="label">Decisions</div><div className="num text-[15px] font-semibold">{sc.avgDecision.toFixed(0)}/100</div></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
          <Panel title="Committee memo">
            <p className="text-[14px] font-semibold leading-snug">{sc.verdict}</p>
            <div className="grid md:grid-cols-3 gap-4 mt-4 text-[12.5px]">
              <MemoList title="Strengths" items={sc.strengths} color="var(--pos)" />
              <MemoList title="Weaknesses" items={sc.weaknesses} color="var(--neg)" />
              <MemoList title="Recurring errors" items={sc.recurring.length ? sc.recurring : ['None flagged.']} color="var(--warn)" />
            </div>
          </Panel>
          <Panel title="Scorecard — process separated from outcome">
            <div className="space-y-2.5">
              {sc.dimensions.map((dm) => (
                <div key={dm.key} title={dm.detail}>
                  <div className="flex justify-between text-[12px]"><span>{dm.name}</span><span className="num flex items-center gap-2">{dm.score.toFixed(0)} <GradeBadge letter={scoreLetter(dm.score)} size="sm" /></span></div>
                  <Bar value={dm.score} max={100} tone={dm.score >= 65 ? 'var(--pos-fill)' : dm.score >= 45 ? 'var(--warn)' : 'var(--neg-fill)'} />
                  <div className="text-[10.5px] text-muted mt-0.5">{dm.detail}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Skill vs. luck"><SkillVsLuck state={state} height={200} /></Panel>
          <Panel title="Your trades at other sizes"><Ghosts state={state} height={200} /></Panel>
        </div>

        <Panel title="Your path vs. benchmarks (same information, same opportunities)">
          <Performance state={state} height={260} />
        </Panel>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Revealed: estimation error vs. luck">
            <div className="text-[12px] text-ink2 mb-3 leading-relaxed">Now that the campaign is over, the hidden true probabilities can be shown. Your realised trading P&L splits into what the desk <b className="text-ink">quoted</b>, how wrong those quotes were (<b className="text-ink">estimation error</b>), and pure <b className="text-ink">luck</b> (realised − true expectation).</div>
            <Waterfall items={[
              ['Quoted expected P&L', d.quotedEv],
              ['Estimation error (true − quoted)', d.estimationError],
              ['Luck (realised − true)', d.luck],
            ]} total={['Realised trading P&L', d.realised]} />
            <div className="text-[12px] text-ink2 mt-3 leading-relaxed">
              {Math.abs(d.estimationError) > Math.abs(d.luck)
                ? 'Estimation error mattered more than luck: being wrong about the edge cost more than random variation. Shrink sizes toward zero when estimates are uncertain, and be suspicious of quotes that look too good.'
                : 'Luck dominated estimation error this campaign. Over a short horizon, randomness swamps even large differences in edge — which is why decisions must be judged ex-ante.'}
              {' '}Costs, financing and research: <span className="num">{signedMoney(-d.costs)}</span>.
            </div>
          </Panel>
          <Panel title={state.config.level === 3 ? 'By pod and strategy type (revealed)' : 'By strategy type (revealed)'}>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-[12px]">
                <thead className="text-muted text-left"><tr><th className="py-1 font-medium">Archetype</th><th className="text-right font-medium">Turns</th><th className="text-right font-medium">P&L</th><th className="text-right font-medium">Quoted EV</th><th className="text-right font-medium">True EV</th></tr></thead>
                <tbody>
                  {sc.byArchetype.map((a) => (
                    <tr key={a.name} className="border-t border-line">
                      <td className="py-1.5">{a.name}</td>
                      <td className="num text-right">{a.turns}</td>
                      <td className={`num text-right ${toneClass(a.pnl)}`}>{signedMoney(a.pnl)}</td>
                      <td className="num text-right">{signedMoney(a.quotedEv)}</td>
                      <td className={`num text-right ${a.trueEv < a.quotedEv * 0.6 ? 'text-warn' : ''}`}>{signedMoney(a.trueEv)}</td>
                    </tr>
                  ))}
                  {!sc.byArchetype.length && <tr><td colSpan={5} className="py-2 text-muted">No trades taken.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted mt-2">{pct(sc.trapShare, 0)} of your capital-at-risk sat in trades whose quoted edge was materially overstated. Desk quotes overstated win probability by {pct(sc.deskBias, 1)} on average across the trades you held.</div>
          </Panel>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Revealed: true regimes vs. the desk's read">
            <RegimeStrip state={state} />
          </Panel>
          <Panel title="Replays on this seed">
            <ReplayChart state={state} others={sameSeed} />
          </Panel>
        </div>

        <Panel title="Turn-by-turn decisions (click to review)">
          <div className="flex flex-wrap gap-1.5">
            {state.history.map((r) => (
              <button key={r.turn} onClick={() => props.onOpenRecord(r)} className="rounded-md border border-line px-1.5 py-1 hover:border-muted" title={`Turn ${r.turn}: ${signedPct(r.ret, 2)} · ${r.grade.verdict}`}>
                <div className="text-[9.5px] text-muted num">{r.turn}</div>
                <GradeBadge letter={r.grade.letter} size="sm" />
                <div className={`text-[9.5px] num ${toneClass(r.ret)}`}>{signedPct(r.ret, 1)}</div>
              </button>
            ))}
          </div>
        </Panel>
      </main>

      {props.reviewRecord && <ResolutionModal record={props.reviewRecord} state={state} onClose={props.closeReview} onWhy={props.onWhy} instant />}
      {props.why && <WhyModal topic={props.why} onClose={props.closeWhy} />}
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-3">
      <div className="label">{label}</div>
      <div className={`num text-[17px] font-semibold mt-0.5 ${tone ?? ''}`}>{value}</div>
    </div>
  );
}

function MemoList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <div className="label mb-1.5" style={{ color }}>{title}</div>
      <ul className="space-y-1.5">
        {items.map((s, i) => <li key={i} className="text-ink2 leading-snug">{s}</li>)}
      </ul>
    </div>
  );
}

function Waterfall({ items, total }: { items: [string, number][]; total: [string, number] }) {
  const max = Math.max(1, ...items.map(([, v]) => Math.abs(v)), Math.abs(total[1]));
  return (
    <div className="space-y-1.5 text-[12px]">
      {items.map(([l, v]) => (
        <div key={l} className="grid grid-cols-[190px_minmax(0,1fr)_86px] items-center gap-2">
          <span className="text-ink2">{l}</span>
          <Bar value={v} max={max} center tone={v >= 0 ? 'var(--c1)' : 'var(--c2)'} height={9} />
          <span className={`num text-right ${toneClass(v)}`}>{signedMoney(v)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[190px_minmax(0,1fr)_86px] items-center gap-2 border-t border-line pt-1.5 font-semibold">
        <span>{total[0]}</span>
        <Bar value={total[1]} max={max} center tone={total[1] >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} height={9} />
        <span className={`num text-right ${toneClass(total[1])}`}>{signedMoney(total[1])}</span>
      </div>
    </div>
  );
}

function RegimeStrip({ state }: { state: GameState }) {
  const colors: Record<string, string> = { normal: 'var(--panel-2)', momentum: 'var(--c7)', meanrev: 'var(--c3)', volspike: 'var(--c5)', liquidity: 'var(--c8)', credit: 'var(--c2)', rates: 'var(--c4)', unwind: 'var(--neg-fill)', decay: 'var(--c6)' };
  const h = state.history;
  const hits = h.filter((r) => topRegime(r.beliefAfter) === r.trueRegime).length;
  const used = REGIMES.filter((r) => h.some((x) => x.trueRegime === r || topRegime(x.beliefAfter) === r));
  return (
    <div>
      <div className="space-y-1">
        {[['True regime', (r: TurnRecord) => r.trueRegime], ['Desk read', (r: TurnRecord) => topRegime(r.beliefAfter)]].map(([label, get]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className="text-[11px] text-muted w-[80px] shrink-0">{label as string}</span>
            <div className="flex flex-1 gap-px">
              {h.map((r) => {
                const g = (get as (r: TurnRecord) => string)(r);
                return <div key={r.turn} className="flex-1 h-5 rounded-[2px]" style={{ background: colors[g], border: '1px solid var(--border)' }} title={`Turn ${r.turn}: ${REGIME_SPECS[g as keyof typeof REGIME_SPECS].name}`} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-ink2">
        {used.map((r) => (
          <span key={r} className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colors[r], border: '1px solid var(--border)' }} />{REGIME_SPECS[r].name}</span>
        ))}
      </div>
      <div className="text-[12px] text-ink2 mt-2">The desk's filter identified the true regime in <b className="num text-ink">{pct(hits / Math.max(1, h.length), 0)}</b> of turns. Regimes with no distinctive indicator signature (structural alpha decay, crowding build-ups) are the hardest to see — and the most expensive.</div>
    </div>
  );
}

function ReplayChart({ state, others }: { state: GameState; others: { id: string; navPath: number[]; date: string; decisionScore: number }[] }) {
  const n = Math.max(state.navPath.length, ...others.map((o) => o.navPath.length));
  const data = Array.from({ length: n }, (_, t) => {
    const row: Record<string, number> = { t, you: state.navPath[t] / state.config.startNav };
    others.forEach((o, i) => (row[`r${i}`] = o.navPath[t] / state.config.startNav));
    row.growth = state.bench.growth.path[t] / state.config.startNav;
    return row;
  });
  return (
    <div>
      <div className="text-[12px] text-ink2 mb-2">Same market path, different decisions. Replay the seed to compare strategies on identical randomness. The half-Kelly line is a counterfactual strategy computed with ex-ante information — not a forecast.</div>
      <div className="h-[200px]">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="t" {...AXIS} />
            <YAxis {...AXIS} width={48} tickFormatter={(v) => `${((v - 1) * 100).toFixed(0)}%`} domain={['auto', 'auto']} />
            <Tooltip content={makeTooltip((l) => `Turn ${l}`, (v) => signedPct(v - 1, 1))} />
            <ReferenceLine y={1} stroke="var(--axis)" />
            {others.map((_, i) => <Line key={i} dataKey={`r${i}`} name={`Earlier run ${i + 1}`} stroke={SERIES[(i + 2) % 8]} strokeWidth={1.4} dot={false} isAnimationActive={false} />)}
            <Line dataKey="growth" name={BENCH_INFO.growth.name} stroke="var(--muted)" strokeDasharray="4 3" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <Line dataKey="you" name="This run" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'This run', color: 'var(--c1)' }, ...others.map((o, i) => ({ label: `Run ${new Date(o.date).toLocaleDateString()} (decisions ${o.decisionScore.toFixed(0)})`, color: SERIES[(i + 2) % 8] })), { label: BENCH_INFO.growth.name, color: 'var(--muted)', dash: true }]} />
      {!others.length && <div className="text-[11px] text-muted mt-1">No earlier runs on this seed yet — press “Replay same seed”.</div>}
      <div className="text-[11px] text-muted mt-2">{BENCH_IDS.map((b) => `${BENCH_INFO[b].name}: ${money(state.bench[b].nav)}`).join(' · ')}</div>
    </div>
  );
}
