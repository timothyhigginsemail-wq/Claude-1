import { useEffect, useState } from 'react';
import { Bar as RBar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BENCH_IDS, BENCH_INFO, topRegime, type GameState, type TurnRecord } from '../../engine/game';
import { ARCHETYPE_INFO } from '../../engine/instruments';
import { FACTORS, FACTOR_INFO, REGIME_SPECS } from '../../engine/market';
import { AXIS, GRID, Legend, makeTooltip } from '../charts';
import { Bar, GradeBadge, Modal, Tabs } from '../kit';
import { annualFromWeeklyLog, money, num, pct, signedMoney, signedPct, toneClass } from '../format';
import { LESSONS, type WhyTopic } from '../content';
import { KellyGauge } from './Risk';

type RT = 'verdict' | 'attrib' | 'sizing' | 'corr' | 'bench' | 'lessons';

export function ResolutionModal({ record: r, state, onClose, onWhy, instant }: { record: TurnRecord; state: GameState; onClose: () => void; onWhy: (t: WhyTopic) => void; instant?: boolean }) {
  const [stage, setStage] = useState(instant ? 4 : 0);
  const [tab, setTab] = useState<RT>('verdict');
  useEffect(() => {
    if (instant) return;
    const ts = [350, 1100, 1800, 2400].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [instant]);
  const d = r.navAfter - r.navBefore;
  const before = topRegime(r.beliefBefore);
  const after = topRegime(r.beliefAfter);
  const maxZ = Math.max(2.5, ...r.Z.map(Math.abs));
  const ended = state.status !== 'playing' && state.history[state.history.length - 1]?.turn === r.turn;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          Turn {r.turn} resolved
          <span className={`num ${toneClass(d)}`}>{signedMoney(d)} ({signedPct(r.ret, 2)})</span>
        </span>
      }
      footer={
        <>
          {stage < 4 && <button className="btn" onClick={() => setStage(4)}>Skip animation</button>}
          <button className="btn btn-primary" onClick={onClose}>{ended ? 'See campaign review →' : instant ? 'Close' : `Continue to turn ${r.turn + 1} →`}</button>
        </>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">
        {/* market */}
        <section className={stage >= 0 ? 'fade-up' : 'opacity-0'}>
          <div className="label mb-2">1 · The market</div>
          {r.jump && <div className="text-[12.5px] text-neg font-semibold mb-2">⚡ {r.jump}</div>}
          <div className="text-[12px] text-ink2 mb-2">
            Desk regime read: <b className="text-ink">{REGIME_SPECS[before].name}</b> → <b className={before !== after ? 'text-warn' : 'text-ink'}>{REGIME_SPECS[after].name}</b> ({pct(r.beliefAfter[after], 0)})
          </div>
          <div className="space-y-1">
            {FACTORS.map((f, i) => (
              <div key={f} className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-2 text-[11px]" title={FACTOR_INFO[f].desc}>
                <span className="text-ink2 truncate">{FACTOR_INFO[f].name}</span>
                <div style={{ transition: 'opacity .4s', opacity: stage >= 1 ? 1 : 0.15 }}>
                  <Bar value={stage >= 1 ? r.Z[i] : 0} max={maxZ} center tone={r.Z[i] >= 0 ? 'var(--c1)' : 'var(--c2)'} height={7} />
                </div>
                <span className="num text-right">{r.Z[i] >= 0 ? '+' : ''}{r.Z[i].toFixed(1)}σ</span>
              </div>
            ))}
          </div>
        </section>

        {/* positions */}
        <section className={stage >= 1 ? 'fade-up' : 'opacity-0'}>
          <div className="label mb-2">2 · Your positions</div>
          {r.positions.length === 0 && <div className="text-[12px] text-muted">You held no positions this turn.</div>}
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto scroll-thin pr-1">
            {r.positions.map((p, i) => (
              <div key={p.id} className="rounded-md border border-line px-2.5 py-1.5" style={{ animation: `fadeUp .35s ease-out ${0.08 * i}s both` }}>
                <div className="flex justify-between gap-2 text-[12px]">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className={`num font-semibold ${toneClass(p.pnl)}`}>{signedMoney(p.pnl)}</span>
                </div>
                <div className="flex justify-between gap-2 text-[11px] text-ink2">
                  <span>
                    <span style={{ color: ARCHETYPE_INFO[p.archetype].color }}>{ARCHETYPE_INFO[p.archetype].short}</span> · {p.outcome} ({p.r >= 0 ? '+' : ''}{pct(p.r, 1)}){p.terminal ? ' · closed' : ''}
                  </span>
                  <span className="num text-muted">exp. {signedMoney(p.notional * p.quotedEv)}</span>
                </div>
              </div>
            ))}
          </div>
          {r.events.filter((e) => e.kind !== 'jump').map((e, i) => (
            <div key={i} className={`text-[12px] mt-2 ${e.kind === 'forced-liquidation' || e.kind === 'closed' || e.kind === 'ruin' || (e.kind === 'derisk' && e.text.includes('trigger')) ? 'text-neg font-semibold' : 'text-ink2'}`}>• {e.text}</div>
          ))}
        </section>

        {/* NAV bridge */}
        <section className={stage >= 2 ? 'fade-up' : 'opacity-0'}>
          <div className="label mb-2">3 · NAV bridge</div>
          <NavBridge r={r} />
        </section>
      </div>

      {/* review */}
      <section className={`mt-5 ${stage >= 3 ? 'fade-up' : 'opacity-0'}`}>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <GradeBadge letter={r.grade.letter} size="lg" />
          <div className="flex-1 min-w-[200px]">
            <div className="label">4 · Decision review — judged on what you knew before the outcome</div>
            <div className="text-[14px] font-semibold mt-0.5">{r.grade.verdict}</div>
            <div className="text-[11.5px] text-muted">Decision score {r.grade.score.toFixed(0)}/100 · {r.exAnte.heldIds.length ? `selection ${pct(r.exAnte.selection, 0)} · size ${num(Math.min(r.exAnte.sizing, 99), 2)}× growth-optimal` : 'held cash'}</div>
          </div>
        </div>
        <Tabs<RT>
          tabs={[
            { id: 'verdict', label: 'Decision vs outcome' },
            { id: 'attrib', label: 'What drove P&L' },
            { id: 'sizing', label: 'How would sizing have changed it?' },
            { id: 'corr', label: 'Did correlation matter?' },
            { id: 'bench', label: 'Benchmarks' },
            { id: 'lessons', label: 'Lessons' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="pt-3 min-h-[240px]">
          {tab === 'verdict' && <Verdict r={r} />}
          {tab === 'attrib' && <Attribution r={r} />}
          {tab === 'sizing' && <SizingReview r={r} onWhy={onWhy} />}
          {tab === 'corr' && <CorrReview r={r} onWhy={onWhy} />}
          {tab === 'bench' && <BenchReview r={r} />}
          {tab === 'lessons' && <Lessons r={r} onWhy={onWhy} />}
        </div>
      </section>
    </Modal>
  );
}

function NavBridge({ r }: { r: TurnRecord }) {
  const items: [string, number][] = [
    ['Position P&L', r.pnlPositions],
    ['Trading costs', -r.costs.tc],
    ['Financing', -r.costs.fin],
    ['Leverage interest', -r.costs.lev],
    ['Cash interest', r.costs.cash],
    ['Research', -r.costs.research],
    ['Forced selling', -r.costs.liquidation],
  ];
  const other = r.navAfter - r.navBefore - items.reduce((a, [, v]) => a + v, 0);
  if (Math.abs(other) > 1) items.push(['Exit costs', other]);
  const max = Math.max(1, ...items.map(([, v]) => Math.abs(v)));
  return (
    <div className="space-y-1.5 text-[12px]">
      <div className="flex justify-between"><span className="text-ink2">Start NAV</span><span className="num">{money(r.navBefore)}</span></div>
      {items.filter(([, v]) => Math.abs(v) >= 1).map(([l, v]) => (
        <div key={l} className="grid grid-cols-[110px_minmax(0,1fr)_76px] items-center gap-2">
          <span className="text-ink2">{l}</span>
          <Bar value={v} max={max} center tone={v >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} height={7} />
          <span className={`num text-right ${toneClass(v)}`}>{signedMoney(v)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>End NAV</span><span className="num">{money(r.navAfter)}</span></div>
      <div className="flex justify-between text-[11px] text-muted"><span>Drawdown from peak</span><span className="num">{pct(r.drawdown)}</span></div>
    </div>
  );
}

function Verdict({ r }: { r: TurnRecord }) {
  const ex = r.exAnte;
  const cells: { k: TurnRecord['grade']['quadrant']; t: string; s: string }[] = [
    { k: 'good-good', t: 'Good decision · good outcome', s: 'Earned.' },
    { k: 'good-bad', t: 'Good decision · bad outcome', s: 'Bad luck. Don\'t change a sound process.' },
    { k: 'bad-good', t: 'Bad decision · good outcome', s: 'Luck. The most dangerous result.' },
    { k: 'bad-bad', t: 'Bad decision · bad outcome', s: 'Predictable.' },
  ];
  return (
    <div className="grid md:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-2 gap-1.5">
        {cells.map((c) => (
          <div key={c.k} className="rounded-md p-2 text-[11px] border" style={{ borderColor: r.grade.quadrant === c.k ? 'var(--accent)' : 'var(--border)', background: r.grade.quadrant === c.k ? 'var(--accent-soft)' : 'transparent' }}>
            <div className="font-semibold">{c.t}</div>
            <div className="text-muted">{c.s}</div>
          </div>
        ))}
      </div>
      <div className="text-[12.5px] text-ink2 space-y-2">
        <table className="w-full text-[12px]">
          <tbody>
            <Row l="Expected return (ex-ante)" v={signedPct(ex.er, 2)} />
            <Row l="Expected log growth (ex-ante)" v={`${signedPct(ex.elog, 3)} / turn → ${signedPct(annualFromWeeklyLog(ex.elog), 1)} / yr`} />
            <Row l="Best achievable (full Kelly, same info)" v={`${signedPct(ex.gOpt, 3)} / turn`} />
            <Row l="Volatility (ex-ante, 1 turn)" v={pct(ex.vol, 2)} />
            <Row l="P(lose > 5%) (ex-ante)" v={pct(ex.pLoss5, 1)} />
            <Row l="Realised return" v={signedPct(r.ret, 2)} tone={toneClass(r.ret)} />
            <Row l="Realised vs. expected (in σ)" v={ex.vol > 0 ? `${num((r.ret - ex.er) / ex.vol, 2)}σ` : '—'} />
          </tbody>
        </table>
        {ex.heldIds.length > 0 && <KellyGauge s={ex.sizing} />}
        {ex.breaches.map((b) => <div key={b} className="text-neg text-[12px]">⚠ {b}</div>)}
      </div>
    </div>
  );
}

function Row({ l, v, tone }: { l: string; v: string; tone?: string }) {
  return (
    <tr className="border-t border-line"><td className="py-1 text-ink2">{l}</td><td className={`num text-right ${tone ?? ''}`}>{v}</td></tr>
  );
}

function Attribution({ r }: { r: TurnRecord }) {
  const a = r.attribution;
  const items: [string, number, string][] = [
    ['Expected edge (alpha)', a.alpha, 'Σ notional × quoted EV: what the desk expected you to earn'],
    ...FACTORS.map((f) => [`${FACTOR_INFO[f].name} factor`, a[f], FACTOR_INFO[f].desc] as [string, number, string]),
    ['Idiosyncratic & nonlinear', a.residual, 'Trade-specific noise plus payoff convexity not explained by linear factor exposure'],
    ['Costs & financing', a.costs, 'Trading, financing and leverage costs net of cash interest'],
  ];
  const shown = items.filter(([, v]) => Math.abs(v) >= 1);
  const max = Math.max(1, ...shown.map(([, v]) => Math.abs(v)));
  const factorSum = FACTORS.reduce((s, f) => s + a[f], 0);
  return (
    <div className="grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <div className="space-y-1.5">
        {shown.map(([l, v, tip]) => (
          <div key={l} className="grid grid-cols-[170px_minmax(0,1fr)_80px] items-center gap-2 text-[12px]" title={tip}>
            <span className="text-ink2 truncate">{l}</span>
            <Bar value={v} max={max} center tone={v >= 0 ? 'var(--c1)' : 'var(--c2)'} height={8} />
            <span className={`num text-right ${toneClass(v)}`}>{signedMoney(v)}</span>
          </div>
        ))}
        {!shown.length && <div className="text-muted text-[12px]">No positions — nothing to attribute.</div>}
      </div>
      <div className="text-[12px] text-ink2 leading-relaxed">
        <p>P&L is split into the <b className="text-ink">edge you expected</b>, the part explained by <b className="text-ink">factor moves</b> (desk loadings × realised shocks), and the <b className="text-ink">residual</b>.</p>
        {shown.length > 0 && (
          <p className="mt-2">
            Factors explained <b className="num text-ink">{signedMoney(factorSum)}</b> versus <b className="num text-ink">{signedMoney(a.alpha)}</b> of expected edge.
            {Math.abs(factorSum) > 3 * Math.abs(a.alpha) ? ' Common-factor moves swamped your edge this turn — typical for a single period; edge only dominates over many turns.' : ' Your edge was a meaningful part of the result.'}
          </p>
        )}
        <p className="mt-2 text-muted text-[11px]">Loadings are the desk's estimates; hidden exposures show up in the residual.</p>
      </div>
    </div>
  );
}

function SizingReview({ r, onWhy }: { r: TurnRecord; onWhy: (t: WhyTopic) => void }) {
  const ex = r.exAnte;
  if (!ex.heldIds.length) return <div className="text-[12px] text-ink2">You held cash. Best available expected growth this turn was {signedPct(annualFromWeeklyLog(ex.gOpt), 1)}/yr at full Kelly (vs {signedPct(annualFromWeeklyLog(ex.gCash), 1)} in cash).</div>;
  const data = ex.curve.map((c) => ({ k: c.k, elog: c.elog, er: c.er, real: undefined as number | undefined }));
  const cf = r.counterfactual;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <div className="text-[12px] font-semibold mb-1">Before the outcome (forecastable)</div>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="k" type="number" domain={[0, 3]} {...AXIS} tickFormatter={(v) => `${v}×`} />
              <YAxis {...AXIS} width={54} tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} />
              <Tooltip content={makeTooltip((l) => `${Number(l).toFixed(2)}× your size`, (v) => `${(v * 100).toFixed(3)}%`)} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Line dataKey="er" name="Expected return" stroke="var(--c2)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line dataKey="elog" name="Expected log growth" stroke="var(--c1)" strokeWidth={2.4} dot={false} isAnimationActive={false} />
              <ReferenceLine x={1} stroke="var(--accent)" label={{ value: 'you', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />
              {ex.kStar <= 3 && <ReferenceLine x={ex.kStar} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: 'optimum', fill: 'var(--muted)', fontSize: 10, position: 'top' }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Expected return', color: 'var(--c2)' }, { label: 'Expected log growth', color: 'var(--c1)' }]} />
        <div className="text-[12px] text-ink2 mt-1">
          Scaling your whole book: growth peaks at <b className="num text-ink">{num(ex.kStar, 2)}×</b> your size. {ex.sizing > 1.05 ? 'You were above the peak — smaller would have compounded faster on average.' : ex.sizing < 0.35 ? 'You were well below it.' : 'You were in the fractional-Kelly zone.'} <button className="text-accent underline" onClick={() => onWhy('kelly')}>Why?</button>
        </div>
      </div>
      <div>
        <div className="text-[12px] font-semibold mb-1">After the outcome (hindsight — not knowable in advance)</div>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <ComposedChart data={cf} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="k" {...AXIS} tickFormatter={(v) => `${v}×`} />
              <YAxis {...AXIS} width={54} tickFormatter={(v) => pct(v, 1)} />
              <Tooltip content={makeTooltip((l) => `${l}× your size`, (v) => signedPct(v, 2))} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <RBar dataKey="ret" name="Realised return" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {cf.map((c, i) => <Cell key={i} fill={c.ret >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} opacity={c.k === 1 ? 1 : 0.55} />)}
              </RBar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[12px] text-ink2 mt-1">
          With hindsight, {r.ret >= 0 ? 'more size would have made more money' : 'less size (or none) would have lost less'} — that is always true after a single outcome, and it is why outcomes are a poor guide to sizing. Over many turns, only the left chart matters.
        </div>
      </div>
    </div>
  );
}

function CorrReview({ r, onWhy }: { r: TurnRecord; onWhy: (t: WhyTopic) => void }) {
  const n = r.exAnte.heldIds.length;
  if (n < 2) return <div className="text-[12px] text-ink2">Correlation needs at least two positions. {r.positions.length === 1 ? 'With a single trade, all of your risk sits in one bet.' : ''}</div>;
  const losers = r.positions.filter((p) => p.r < 0).length;
  const data = r.exAnte.losers.joint.map((j, k) => ({ k, joint: j, indep: r.exAnte.losers.indep[k] }));
  const tailJ = r.exAnte.losers.joint.slice(losers).reduce((a, b) => a + b, 0);
  const tailI = r.exAnte.losers.indep.slice(losers).reduce((a, b) => a + b, 0);
  return (
    <div className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
      <div>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="k" {...AXIS} />
              <YAxis {...AXIS} width={40} tickFormatter={(v) => pct(v, 0)} />
              <Tooltip content={makeTooltip((l) => `${l} losing positions`, (v) => pct(v, 1))} />
              <RBar dataKey="joint" name="Desk model (shared factors)" fill="var(--c1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <RBar dataKey="indep" name="If independent" fill="var(--c3)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <ReferenceLine x={losers} stroke="var(--neg-fill)" strokeWidth={2} label={{ value: 'actual', fill: 'var(--neg)', fontSize: 10, position: 'top' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Desk model (shared factors)', color: 'var(--c1)' }, { label: 'If the positions were independent', color: 'var(--c3)' }]} />
      </div>
      <div className="text-[12px] text-ink2 leading-relaxed">
        <p><b className="text-ink">{losers} of {n}</b> positions lost this turn.</p>
        <p className="mt-1.5">Probability of at least that many losers: <b className="num text-ink">{pct(tailJ, 1)}</b> under the desk's joint model vs <b className="num text-ink">{pct(tailI, 1)}</b> if they were independent.</p>
        <p className="mt-1.5">{tailJ > 2 * tailI && tailI < 0.2 ? 'Shared factor exposure made a broad loss far more likely than a naive "independent bets" view suggests.' : 'Correlation did not materially change the odds of this outcome.'}</p>
        {tailJ < 0.05 && losers >= Math.ceil(n * 0.6) && <p className="mt-1.5 text-warn">Even the desk model rated this unlikely — a sign of exposure the desk has not measured (or a regime it did not anticipate).</p>}
        <button className="text-accent underline mt-2" onClick={() => onWhy('correlation')}>Why?</button>
      </div>
    </div>
  );
}

function BenchReview({ r }: { r: TurnRecord }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <table className="w-full text-[12px]">
        <thead className="text-muted"><tr><th className="text-left font-medium py-1">Portfolio</th><th className="text-right font-medium">This turn</th><th className="text-right font-medium">NAV</th></tr></thead>
        <tbody>
          <tr className="border-t border-line font-semibold"><td className="py-1.5">You</td><td className={`num text-right ${toneClass(r.ret)}`}>{signedPct(r.ret, 2)}</td><td className="num text-right">{money(r.navAfter)}</td></tr>
          {BENCH_IDS.map((b) => {
            const x = r.bench[b];
            const ret = x.navBefore > 0 ? x.navAfter / x.navBefore - 1 : 0;
            return (
              <tr key={b} className="border-t border-line" title={BENCH_INFO[b].desc}><td className="py-1.5 text-ink2">{BENCH_INFO[b].name}</td><td className={`num text-right ${toneClass(ret)}`}>{signedPct(ret, 2)}</td><td className="num text-right">{money(x.navAfter)}</td></tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[12px] text-ink2 leading-relaxed">
        Benchmarks are re-optimised every turn using only the desk's information at decision time — the same quotes, the same regime read, the same opportunities. Differences come from <b className="text-ink">selection, sizing and diversification</b>, not foresight.
        {BENCH_IDS.map((b) => <div key={b} className="mt-1 text-[11px] text-muted"><b>{BENCH_INFO[b].name}:</b> {BENCH_INFO[b].desc}</div>)}
      </div>
    </div>
  );
}

function Lessons({ r, onWhy }: { r: TurnRecord; onWhy: (t: WhyTopic) => void }) {
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {r.lessons.map((k) => {
        const l = LESSONS[k];
        if (!l) return null;
        return (
          <div key={k} className="rounded-lg border border-line p-3">
            <div className="font-semibold text-[13px]">{l.title}</div>
            <p className="text-[12px] text-ink2 mt-1.5 leading-relaxed">{l.body}</p>
            {l.why && <button className="btn text-[11.5px] mt-2" onClick={() => onWhy(l.why!)}>Why? Explore the math →</button>}
          </div>
        );
      })}
    </div>
  );
}
