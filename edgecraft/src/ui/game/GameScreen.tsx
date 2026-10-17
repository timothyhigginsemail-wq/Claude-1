import { useEffect, useMemo, useState } from 'react';
import { advance, buyResearch, topRegime, type GameConfig, type GameState, type Order, type TurnRecord } from '../../engine/game';
import { REGIME_SPECS } from '../../engine/market';
import { LEVELS } from '../../engine/levels';
import { Logo } from '../Home';
import { money, mult, pct, signedMoney, signedPct, toneClass } from '../format';
import { Tabs, useMediaQuery } from '../kit';
import { exportGameFile, type Prefs } from '../storage';
import { useDeskBase, usePortfolio } from './useDesk';
import { Briefing } from './Briefing';
import { OpportunityList } from './Opportunities';
import { SizingWorkspace } from './Sizing';
import { BookPanel } from './Book';
import { RiskPanel } from './Risk';
import { BottomPanel } from './Bottom';
import { ResolutionModal } from './Resolution';
import { EndReview } from './EndReview';
import { WhyModal } from './Why';
import { Coach } from './Coach';
import type { WhyTopic } from '../content';

export function GameScreen(props: {
  state: GameState;
  setState: (s: GameState) => void;
  prefs: Prefs;
  setPrefs: (f: (p: Prefs) => Prefs) => void;
  onExit: () => void;
  onToggleTheme: () => void;
  onOpenLab: (exp?: number) => void;
  onReplay: (cfg: GameConfig) => void;
}) {
  const { state, setState } = props;
  const desk = useDeskBase(state);
  const initialTargets = useMemo(() => Object.fromEntries(Object.entries(state.positions).map(([id, p]) => [id, p.notional])), [state]);
  const [targets, setTargets] = useState<Record<string, number>>(initialTargets);
  const [userProbs, setUserProbs] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [lastRecord, setLastRecord] = useState<TurnRecord | null>(null);
  const [reviewRecord, setReviewRecord] = useState<TurnRecord | null>(null);
  const [why, setWhy] = useState<WhyTopic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<'market' | 'size' | 'risk' | 'history'>('market');
  const pf = usePortfolio(state, desk, targets);
  const wide = useMediaQuery('(min-width: 1024px)');

  // reset the draft whenever the turn changes
  useEffect(() => {
    setTargets(initialTargets);
    setUserProbs({});
  }, [state.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !desk.universe.includes(selected)) {
      const firstNew = state.offered.find((id) => state.instruments[id].archetype !== 'future') ?? desk.universe[0] ?? null;
      setSelected(firstNew);
    }
  }, [desk.universe]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const setTarget = (id: string, n: number) => {
    setTargets((t) => {
      const next = { ...t };
      if (state.config.level === 1 && n !== 0) {
        // Level 1: one trade at a time — selecting a new size replaces any other draft
        for (const k of Object.keys(next)) if (k !== id) next[k] = 0;
      }
      next[id] = n;
      return next;
    });
  };

  const orders: Order[] = useMemo(() => {
    const out: Order[] = [];
    const ids = new Set([...Object.keys(targets), ...Object.keys(state.positions)]);
    for (const id of ids) {
      const cur = state.positions[id]?.notional ?? 0;
      const tgt = targets[id] ?? cur;
      if (Math.abs(tgt - cur) >= 1 || userProbs[id] !== undefined) out.push({ id, target: tgt, userProb: userProbs[id] });
    }
    return out;
  }, [targets, userProbs, state.positions]);

  const doAdvance = () => {
    if (pf.check.errors.length) {
      setError(pf.check.errors.join(' '));
      return;
    }
    setBusy(true);
    setTimeout(() => {
      try {
        const { state: next, record } = advance(state, orders);
        setState(next);
        setLastRecord(record);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const doResearch = (id: string, kind: 'signal' | 'risk') => {
    const { state: next, message } = buyResearch(state, id, kind);
    setState(next);
    setToast(message);
  };

  const ended = state.status !== 'playing';
  const lvl = LEVELS[state.config.level];
  const dd = 1 - state.nav / state.peak;
  const lastRet = state.history.length ? state.history[state.history.length - 1] : null;
  const top = topRegime(state.belief);
  const pendingCount = orders.filter((o) => Math.abs(o.target - (state.positions[o.id]?.notional ?? 0)) >= 1).length;

  if (ended && !lastRecord) {
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
        onOpenLab={props.onOpenLab}
      />
    );
  }

  const left = (
    <div className="flex flex-col gap-3 min-h-0">
      <Briefing state={state} />
      <OpportunityList state={state} desk={desk} targets={targets} selected={selected} onSelect={(id) => { setSelected(id); setMobileTab('size'); }} />
    </div>
  );
  const center = (
    <div className="flex flex-col gap-3 min-h-0">
      <Coach state={state} prefs={props.prefs} onDismiss={() => props.setPrefs((p) => ({ ...p, onboarded: true }))} onWhy={setWhy} />
      {selected && desk.quotes[selected] && (
        <SizingWorkspace
          key={selected}
          state={state}
          desk={desk}
          id={selected}
          targets={targets}
          setTarget={setTarget}
          userProb={userProbs[selected] ?? state.positions[selected]?.userProb}
          setUserProb={(p) => setUserProbs((u) => {
            const next = { ...u };
            if (p === undefined) delete next[selected];
            else next[selected] = p;
            return next;
          })}
          onResearch={doResearch}
          onWhy={setWhy}
        />
      )}
      <BookPanel state={state} desk={desk} targets={targets} setTarget={setTarget} onSelect={setSelected} check={pf.check} reset={() => setTargets(initialTargets)} />
    </div>
  );
  const right = <RiskPanel state={state} desk={desk} pf={pf} targets={targets} onWhy={setWhy} />;
  const bottom = <BottomPanel state={state} onOpenRecord={setReviewRecord} />;

  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line" style={{ background: 'color-mix(in oklab, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="px-3 py-2 flex items-center gap-4 overflow-x-auto scroll-thin">
          <button className="flex items-center gap-2 shrink-0" onClick={props.onExit} title="Home">
            <Logo size={26} />
            <div className="hidden xl:block text-left">
              <div className="font-bold text-[13px] leading-none">Edgecraft</div>
              <div className="text-[10.5px] text-muted">L{state.config.level} · {lvl.title}</div>
            </div>
          </button>
          <TopStat label="NAV" value={money(state.nav)} />
          <TopStat label="Last turn" value={lastRet ? signedMoney(lastRet.navAfter - lastRet.navBefore) : '—'} sub={lastRet ? signedPct(lastRet.ret, 2) : ''} tone={lastRet ? toneClass(lastRet.ret) : ''} />
          <TopStat label="Total return" value={signedPct(state.nav / state.config.startNav - 1)} tone={toneClass(state.nav - state.config.startNav)} />
          <TopStat label="Drawdown" value={pct(dd)} tone={dd > lvl.ddDerisk * 0.6 ? 'text-neg' : ''} sub={state.config.level > 1 ? `limit ${pct(lvl.ddDerisk, 0)}/${pct(lvl.ddStop, 0)}` : ''} />
          <TopStat label="Gross lev." value={mult(pf.check.gross / state.nav)} sub={`cap ${mult(pf.check.maxGross, 1)}${state.deriskActive ? ' (de-risk)' : ''}`} tone={pf.check.gross > pf.check.maxGross * state.nav ? 'text-neg' : ''} />
          <TopStat label="Regime read" value={REGIME_SPECS[top].name} sub={`${pct(state.belief[top], 0)} confidence`} />
          <TopStat label="Turn" value={`${state.turn}${state.config.turns ? ` / ${state.config.turns}` : ''}`} sub={state.config.mode === 'sandbox' ? 'sandbox' : `seed ${state.config.seed}`} />
          <div className="flex-1" />
          <div className="hidden md:flex gap-1 shrink-0">
            <button className="btn btn-ghost" onClick={() => props.onOpenLab()} title="Experiment Lab">Lab</button>
            <button className="btn btn-ghost" onClick={() => exportGameFile(state)} title="Download save file">Save</button>
            <button className="btn btn-ghost" onClick={props.onToggleTheme} aria-label="Toggle theme">{props.prefs.theme === 'dark' ? '☀︎' : '☾'}</button>
          </div>
          <button className="btn btn-primary shrink-0" disabled={busy || pf.check.errors.length > 0} onClick={doAdvance} title={pf.check.errors.join(' ')}>
            {busy ? 'Simulating…' : `Advance Market ${pendingCount ? `(${pendingCount} order${pendingCount > 1 ? 's' : ''})` : '▸'}`}
          </button>
        </div>
        {(error || pf.check.errors.length > 0) && (
          <div className="px-3 pb-2 text-[12px] text-neg">{error ?? pf.check.errors.join(' ')}</div>
        )}
      </header>

      {toast && (
        <div className="fixed bottom-4 right-4 z-40 panel px-4 py-3 max-w-md shadow-xl fade-up text-[12.5px]">
          <div className="label mb-1">Research result</div>
          {toast}
        </div>
      )}

      {/* Mobile: tabbed */}
      {!wide && <div className="px-2 pt-2">
        <Tabs
          tabs={[
            { id: 'market', label: 'Market' },
            { id: 'size', label: 'Size & book' },
            { id: 'risk', label: 'Risk' },
            { id: 'history', label: 'History' },
          ]}
          value={mobileTab}
          onChange={setMobileTab}
        />
        <div className="pt-2 pb-6 flex flex-col gap-3">
          {mobileTab === 'market' && left}
          {mobileTab === 'size' && center}
          {mobileTab === 'risk' && right}
          {mobileTab === 'history' && bottom}
        </div>
      </div>}

      {/* Desktop: three columns + bottom */}
      {wide && <>
        <div className="grid gap-3 p-3 grid-cols-[minmax(290px,330px)_minmax(0,1fr)_minmax(320px,380px)] items-start">
          <div className="sticky top-[64px] max-h-[calc(100vh-76px)] overflow-y-auto scroll-thin pr-1">{left}</div>
          <div className="min-w-0">{center}</div>
          <div className="sticky top-[64px] max-h-[calc(100vh-76px)] overflow-y-auto scroll-thin pr-1">{right}</div>
        </div>
        <div className="px-3 pb-6">{bottom}</div>
      </>}

      {lastRecord && (
        <ResolutionModal
          record={lastRecord}
          state={state}
          onClose={() => setLastRecord(null)}
          onWhy={setWhy}
        />
      )}
      {reviewRecord && <ResolutionModal record={reviewRecord} state={state} onClose={() => setReviewRecord(null)} onWhy={setWhy} instant />}
      {why && <WhyModal topic={why} onClose={() => setWhy(null)} onOpenLab={props.onOpenLab} />}
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
