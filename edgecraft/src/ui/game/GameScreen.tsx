import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS, advanceMany, buyResearch, carriedTargets, endSession, topRegime, type GameConfig, type GameState, type Order, type TurnRecord } from '../../engine/game';
import { REGIME_SPECS } from '../../engine/market';
import { LEVELS } from '../../engine/levels';
import { Logo } from '../Home';
import { money, mult, pct, signedMoney, signedPct, toneClass } from '../format';
import { GradeBadge, Modal, Tabs, useMediaQuery } from '../kit';
import type { Prefs } from '../storage';
import { useDeskBase, usePortfolio } from './useDesk';
import { Briefing } from './Briefing';
import { SizingWorkspace } from './Sizing';
import { RiskPanel } from './Risk';
import { BottomPanel } from './Bottom';
import { ResolutionModal } from './Resolution';
import { EndReview } from './EndReview';
import { WhyModal } from './Why';
import { Blotter } from './Blotter';
import type { WhyTopic } from '../content';

export function GameScreen(props: {
  state: GameState;
  setState: (s: GameState) => void;
  prefs: Prefs;
  onExit: () => void;
  onToggleTheme: () => void;
  onReplay: (cfg: GameConfig) => void;
}) {
  const { state, setState } = props;
  const desk = useDeskBase(state);
  const initialTargets = useMemo(() => carriedTargets(state), [state]);
  const [targets, setTargets] = useState<Record<string, number>>(initialTargets);
  const [details, setDetails] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ records: TurnRecord[]; stopped?: string } | null>(null);
  const [reviewRecord, setReviewRecord] = useState<TurnRecord | null>(null);
  const [why, setWhy] = useState<WhyTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [mobileTab, setMobileTab] = useState<'trade' | 'market' | 'risk' | 'history'>('trade');
  const pf = usePortfolio(state, desk, targets);
  const wide = useMediaQuery('(min-width: 1024px)');

  // carry the book into each new week
  useEffect(() => {
    setTargets(initialTargets);
  }, [state.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const setTarget = (id: string, n: number) => setTargets((t) => ({ ...t, [id]: n }));

  const orders: Order[] = useMemo(() => {
    const out: Order[] = [];
    const ids = new Set([...Object.keys(targets), ...Object.keys(state.positions)]);
    for (const id of ids) {
      const cur = state.positions[id]?.notional ?? 0;
      const tgt = targets[id] ?? cur;
      if (Math.abs(tgt - cur) >= 1) out.push({ id, target: tgt });
    }
    return out;
  }, [targets, state.positions]);

  const doAdvance = (weeks = 1) => {
    if (busy || state.status !== 'playing') return;
    if (pf.check.errors.length) {
      setError(pf.check.errors.join(' '));
      return;
    }
    setBusy(true);
    setTimeout(() => {
      try {
        const { state: next, records, stoppedEarly } = advanceMany(state, orders, weeks);
        setState(next);
        setLastRun({ records, stopped: stoppedEarly });
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 20);
  };
  const advanceRef = useRef(doAdvance);
  advanceRef.current = doAdvance;

  // Enter advances the market (unless typing in a field or a dialog is open)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== 'Enter' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      advanceRef.current(e.shiftKey ? 4 : 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const doResearch = (id: string, kind: 'signal' | 'risk') => {
    const { state: next, message } = buyResearch(state, id, kind);
    setState(next);
    setToast(message);
  };

  const lvl = LEVELS[state.config.level];
  const dd = 1 - state.nav / state.peak;
  const top = topRegime(state.belief);
  const pendingCount = Object.keys({ ...targets, ...initialTargets }).filter((id) => Math.abs((targets[id] ?? 0) - (initialTargets[id] ?? 0)) >= 1).length;

  if (state.status !== 'playing') {
    return (
      <EndReview
        state={state}
        onHome={props.onExit}
        onReplay={props.onReplay}
        onToggleTheme={props.onToggleTheme}
        onOpenRecord={setReviewRecord}
        reviewRecord={reviewRecord}
        closeReview={() => setReviewRecord(null)}
        onWhy={setWhy}
        why={why}
        closeWhy={() => setWhy(null)}
      />
    );
  }

  const blocked = busy || pf.check.errors.length > 0;
  const advanceBtn = (
    <div className="flex items-center gap-1 shrink-0">
      <button className="btn btn-primary" disabled={blocked} onClick={() => doAdvance(1)} title={pf.check.errors.join(' ') || 'Shortcut: Enter'}>
        {busy ? 'Simulating…' : `Advance week ${pendingCount ? `· ${pendingCount} order${pendingCount > 1 ? 's' : ''}` : '▸'}`}
      </button>
      {[4, 13, 26].map((n) => (
        <button key={n} className="btn num px-2" disabled={blocked} onClick={() => doAdvance(n)} title={`Advance ${n} weeks, carrying the book${n === 4 ? ' (Shift+Enter)' : ''}. Stops early on a margin call, de-risk or market shock.`}>
          {n}w
        </button>
      ))}
    </div>
  );

  const blotter = <Blotter state={state} desk={desk} targets={targets} baseline={initialTargets} setTarget={setTarget} setAll={setTargets} onDetails={setDetails} check={pf.check} reset={() => setTargets(initialTargets)} />;
  const result = lastRun && lastRun.records.length > 0 && (
    <ResultStrip run={lastRun} onReview={(r) => setReviewRecord(r)} onClose={() => setLastRun(null)} />
  );
  const right = <RiskPanel state={state} desk={desk} pf={pf} targets={targets} onWhy={setWhy} />;
  const bottom = <BottomPanel state={state} onOpenRecord={setReviewRecord} />;

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line" style={{ background: 'color-mix(in oklab, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="px-3 py-2 flex items-center gap-4 overflow-x-auto scroll-thin">
          <button className="flex items-center gap-2 shrink-0" onClick={props.onExit} title="Home">
            <Logo size={26} />
            <div className="hidden xl:block text-left">
              <div className="font-bold text-[13px] leading-none">Edgecraft</div>
              <div className="text-[10.5px] text-muted">Free play</div>
            </div>
          </button>
          <TopStat label="NAV" value={money(state.nav)} />
          <TopStat label="Total return" value={signedPct(state.nav / state.config.startNav - 1)} tone={toneClass(state.nav - state.config.startNav)} />
          <TopStat label="Drawdown" value={pct(dd)} tone={dd > lvl.ddDerisk * 0.6 ? 'text-neg' : ''} sub={`limit ${pct(lvl.ddDerisk, 0)} / ${pct(lvl.ddStop, 0)}`} />
          <TopStat label="Gross lev." value={mult(pf.check.gross / state.nav)} sub={`cap ${mult(pf.check.maxGross, 1)}${state.deriskActive ? ' (de-risk)' : ''}`} tone={pf.check.gross > pf.check.maxGross * state.nav ? 'text-neg' : ''} />
          <TopStat label="Regime read" value={REGIME_SPECS[top].name} sub={`${pct(state.belief[top], 0)} confidence`} />
          <TopStat label="Week" value={`${state.turn}${state.config.turns ? ` / ${state.config.turns}` : ''}`} sub={state.config.scenario && state.config.scenario !== 'none' ? `drill: ${SCENARIOS[state.config.scenario].name}` : `seed ${state.config.seed}`} />
          <div className="flex-1" />
          <div className="hidden md:flex gap-1 shrink-0">
            <button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>Finish & review</button>
            <button className="btn btn-ghost" onClick={props.onToggleTheme} aria-label="Toggle theme">{props.prefs.theme === 'dark' ? '☀︎' : '☾'}</button>
          </div>
          {advanceBtn}
        </div>
        {(error || pf.check.errors.length > 0) && <div className="px-3 pb-2 text-[12px] text-neg">{error ?? pf.check.errors.join(' ')}</div>}
      </header>

      {toast && (
        <div className="fixed bottom-4 right-4 z-40 panel px-4 py-3 max-w-md shadow-xl fade-up text-[12.5px]">
          <div className="label mb-1">Research result</div>
          {toast}
        </div>
      )}

      {!wide && (
        <div className="px-2 pt-2">
          <Tabs tabs={[{ id: 'trade', label: 'Trade' }, { id: 'market', label: 'Market' }, { id: 'risk', label: 'Risk' }, { id: 'history', label: 'History' }]} value={mobileTab} onChange={setMobileTab} />
          <div className="pt-2 pb-6 flex flex-col gap-3">
            {mobileTab === 'trade' && <>{result}{blotter}</>}
            {mobileTab === 'market' && <Briefing state={state} />}
            {mobileTab === 'risk' && right}
            {mobileTab === 'history' && bottom}
          </div>
          <div className="sticky bottom-0 -mx-2 px-2 py-2 border-t border-line flex items-center gap-2" style={{ background: 'var(--bg)' }}>
            <div className="text-[11px] text-muted flex-1 num">Week {state.turn} · gross {mult(pf.check.gross / state.nav)}</div>
            <button className="btn" onClick={() => setConfirmEnd(true)}>Finish</button>
            {advanceBtn}
          </div>
        </div>
      )}

      {wide && (
        <>
          <div className="grid gap-3 p-3 grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(320px,370px)] items-start">
            <div className="sticky top-[64px] max-h-[calc(100vh-76px)] overflow-y-auto scroll-thin pr-1"><Briefing state={state} /></div>
            <div className="min-w-0 flex flex-col gap-3">{result}{blotter}</div>
            <div className="sticky top-[64px] max-h-[calc(100vh-76px)] overflow-y-auto scroll-thin pr-1">{right}</div>
          </div>
          <div className="px-3 pb-6">{bottom}</div>
        </>
      )}

      {details && state.instruments[details] && desk.quotes[details] && (
        <Modal open wide onClose={() => setDetails(null)} title="Sizing analysis" footer={<button className="btn btn-primary" onClick={() => setDetails(null)}>Done</button>}>
          <SizingWorkspace
            key={details}
            state={state}
            desk={desk}
            id={details}
            targets={targets}
            setTarget={setTarget}
            userProb={undefined}
            setUserProb={() => {}}
            onResearch={doResearch}
            onWhy={setWhy}
          />
        </Modal>
      )}
      {confirmEnd && (
        <Modal open onClose={() => setConfirmEnd(false)} title="Finish this session?" footer={<>
          <button className="btn" onClick={() => setConfirmEnd(false)}>Keep playing</button>
          <button className="btn btn-primary" onClick={() => { setConfirmEnd(false); setState(endSession(state)); }}>Finish & see review</button>
        </>}>
          <p className="text-[13px] text-ink2">You'll get the full review of your {state.history.length} week{state.history.length === 1 ? '' : 's'}: decision grades, benchmarks, and the hidden true probabilities revealed. The session can't be resumed afterwards.</p>
        </Modal>
      )}
      {reviewRecord && <ResolutionModal record={reviewRecord} state={state} onClose={() => setReviewRecord(null)} onWhy={setWhy} instant />}
      {why && <WhyModal topic={why} onClose={() => setWhy(null)} />}
    </div>
  );
}

function ResultStrip({ run, onReview, onClose }: { run: { records: TurnRecord[]; stopped?: string }; onReview: (r: TurnRecord) => void; onClose: () => void }) {
  const rs = run.records;
  const first = rs[0];
  const last = rs[rs.length - 1];
  const d = last.navAfter - first.navBefore;
  const ret = last.navAfter / first.navBefore - 1;
  const avgGrade = rs.reduce((a, r) => a + r.grade.score, 0) / rs.length;
  const letter = avgGrade >= 80 ? 'A' : avgGrade >= 65 ? 'B' : avgGrade >= 45 ? 'C' : avgGrade >= 25 ? 'D' : 'F';
  const expected = rs.reduce((a, r) => a + r.exAnte.elog, 0);
  const realised = rs.reduce((a, r) => a + r.logRet, 0);
  const ghostRet = (g: 'half' | 'double') => (first.ghosts && last.ghosts ? last.ghosts[g].navAfter / first.ghosts[g].navBefore - 1 : NaN);
  const alerts = rs.flatMap((r) => r.events.filter((e) => e.kind === 'forced-liquidation' || e.kind === 'derisk' || e.kind === 'jump').map((e) => `Week ${r.turn}: ${e.text}`));
  const best = rs.length === 1 ? last.positions.reduce<TurnRecord['positions'][number] | null>((a, p) => (!a || p.pnl > a.pnl ? p : a), null) : null;
  const worst = rs.length === 1 ? last.positions.reduce<TurnRecord['positions'][number] | null>((a, p) => (!a || p.pnl < a.pnl ? p : a), null) : null;
  return (
    <div className="panel px-3 py-2.5 fade-up flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderColor: d >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)' }}>
      <div>
        <div className="label text-[9.5px]">{rs.length === 1 ? `Week ${first.turn} result` : `Weeks ${first.turn}–${last.turn}`}</div>
        <div className={`num text-[16px] font-semibold ${toneClass(d)}`}>{signedMoney(d)} <span className="text-[12px]">({signedPct(ret, 2)})</span></div>
      </div>
      <div className="flex items-center gap-2" title={rs.length === 1 ? last.grade.verdict : 'Average decision grade over these weeks'}>
        <GradeBadge letter={rs.length === 1 ? last.grade.letter : letter} size="sm" />
        <span className="text-[12px] text-ink2 max-w-[260px]">{rs.length === 1 ? last.grade.verdict : `Average decision score ${avgGrade.toFixed(0)}/100`}</span>
      </div>
      <div className="text-[11.5px] num" title="Expected compound growth you were taking on (desk model) vs what happened">
        <span className="text-muted font-sans">Expected </span>{signedPct(Math.exp(expected) - 1, 2)}
        <span className="text-muted font-sans"> · luck </span><span className={toneClass(realised - expected)}>{signedPct(Math.exp(realised - expected) - 1, 2)}</span>
      </div>
      {isFinite(ghostRet('half')) && (
        <div className="text-[11.5px] num" title="Your exact trades at half and double the size, same market">
          <span className="text-muted font-sans">½ size </span><span className={toneClass(ghostRet('half'))}>{signedPct(ghostRet('half'), 2)}</span>
          <span className="text-muted font-sans"> · 2× size </span><span className={toneClass(ghostRet('double'))}>{signedPct(ghostRet('double'), 2)}</span>
        </div>
      )}
      {best && best.pnl > 0 && <div className="text-[11.5px]"><span className="text-muted">Best </span>{best.name} <span className="num text-pos">{signedMoney(best.pnl)}</span></div>}
      {worst && worst.pnl < 0 && <div className="text-[11.5px]"><span className="text-muted">Worst </span>{worst.name} <span className="num text-neg">{signedMoney(worst.pnl)}</span></div>}
      {run.stopped && <div className="text-[11.5px] text-warn basis-full">Stopped early so you can react: {run.stopped}</div>}
      {alerts.slice(0, 3).map((e, i) => <div key={i} className="text-[11.5px] text-neg basis-full">⚠ {e}</div>)}
      <div className="flex-1" />
      <button className="btn text-[12px]" onClick={() => onReview(last)}>Review week {last.turn}</button>
      <button className="btn btn-ghost text-[12px]" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

function TopStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="shrink-0 min-w-[78px]">
      <div className="label text-[9.5px]">{label}</div>
      <div className={`num text-[14px] font-semibold leading-tight ${tone ?? ''}`}>{value}</div>
      {sub ? <div className="text-[10.5px] text-muted num leading-tight">{sub}</div> : null}
    </div>
  );
}
