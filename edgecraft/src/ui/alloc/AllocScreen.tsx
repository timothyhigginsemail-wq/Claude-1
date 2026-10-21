import { useEffect, useMemo, useState } from 'react';
import {
  SHADOW_INFO, checkPlan, endAllocSession, nav, runRound, weekOf, type AllocState, type PM, type Plan, type RoundRecord, type ShadowId,
} from '../../engine/allocator';
import { REGIME_SPECS, REGIMES } from '../../engine/market';
import { Logo } from '../Home';
import { Bar, Modal, Panel, useDebounced } from '../kit';
import { money, num, pct, signedMoney, signedPct, toneClass } from '../format';
import { divergingColor } from '../charts';
import { availablePMs, platformView, verdict, type Draft, type PMView } from './analytics';
import { PMDetail } from './PMDetail';
import { RoundReport } from './RoundReport';
import { History } from './History';
import { AllocReview } from './Review';

const RISK_CHIPS = [0, 0.005, 0.01, 0.02, 0.03];
/** Stop levels; 1 (a 100% drawdown) means no stop. Kept finite so it survives JSON saves. */
const STOPS = [0.05, 0.075, 0.1, 0.15, 0.2, 1];
const JUMPS = [4, 6, 8];

export function AllocScreen({ state, setState, onExit, onToggleTheme, theme, onNew }: {
  state: AllocState;
  setState: (s: AllocState) => void;
  onExit: () => void;
  onToggleTheme: () => void;
  theme: 'dark' | 'light';
  onNew: (seed?: string) => void;
}) {
  const N = nav(state);
  const initial = useMemo(() => {
    const d: Record<string, Draft> = {};
    for (const pm of availablePMs(state)) d[pm.id] = { risk: pm.status === 'active' ? pm.riskBudget / N : 0, stop: pm.stop };
    return d;
  }, [state, N]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [jump, setJump] = useState(6);
  const [detail, setDetail] = useState<PM | null>(null);
  const [report, setReport] = useState<RoundRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => setDrafts(initial), [state.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const deb = useDebounced(drafts, 120);
  const view = useMemo(() => platformView(state, deb, jump), [state, deb, jump]);
  const plan: Plan[] = Object.entries(drafts).map(([id, d]) => ({ id, riskBudget: d.risk * N, stop: d.stop }));
  const chk = checkPlan(state, plan);
  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const scaleAll = (k: number) => setDrafts((d) => Object.fromEntries(Object.entries(d).map(([id, x]) => [id, { ...x, risk: Math.round(x.risk * k * 10000) / 10000 }])));

  const run = () => {
    try {
      const { state: next, record } = runRound(state, plan, jump);
      setState(next);
      setReport(record);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (state.status === 'ended' && !report) return <AllocReview state={state} onHome={onExit} onNew={onNew} onToggleTheme={onToggleTheme} />;

  const dd = 1 - N / state.peak;
  const mk = weekOf(state.config.seed, state.week - 1);
  const top = REGIMES.reduce((a, r) => (mk.belief[r] > mk.belief[a] ? r : a), REGIMES[0]);
  const active = view.rows.filter((r) => r.pm.status === 'active');
  const pitching = view.rows.filter((r) => r.pm.status === 'candidate');
  const tv = state.config.targetVol;

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b border-line" style={{ background: 'color-mix(in oklab, var(--bg) 90%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="px-4 py-2 flex items-center gap-5 overflow-x-auto scroll-thin">
          <button className="flex items-center gap-2 shrink-0" onClick={onExit} title="Home"><Logo size={26} /><span className="font-bold text-[13px] hidden xl:inline">Edgecraft · Allocator</span></button>
          <Top label="Platform NAV" value={money(N)} />
          <Top label="Return" value={signedPct(N / state.config.nav0 - 1)} tone={toneClass(N - state.config.nav0)} />
          <Top label="Drawdown" value={pct(dd)} sub={`risk cut at ${pct(state.config.platformStop, 0)}`} tone={dd > state.config.platformStop * 0.6 ? 'text-neg' : ''} />
          <Top label="Risk used" value={`${pct(view.vol, 1)} / ${pct(tv, 0)}`} sub="planned vol vs target" tone={view.vol > tv * 1.1 ? 'text-neg' : view.vol < tv * 0.6 ? 'text-warn' : 'text-pos'} />
          <Top label="Market" value={REGIME_SPECS[top].name} sub={`${pct(mk.belief[top], 0)} confidence`} />
          <Top label="Week" value={`${state.week}`} sub={`round ${state.round + 1}${state.config.rounds ? ` / ${state.config.rounds}` : ''}`} />
          <div className="flex-1" />
          <button className="btn btn-ghost shrink-0" onClick={() => setConfirmEnd(true)}>Finish & review</button>
          <button className="btn btn-ghost shrink-0" onClick={onToggleTheme} aria-label="Toggle theme">{theme === 'dark' ? '☀︎' : '☾'}</button>
          <div className="flex items-center gap-1 shrink-0">
            {JUMPS.map((j) => (
              <button key={j} className={`btn num px-2.5 ${jump === j ? 'btn-primary' : ''}`} onClick={() => setJump(j)}>{j}w</button>
            ))}
            <button className="btn btn-primary ml-1" onClick={run} disabled={chk.errors.length > 0}>Run {jump} weeks ▸</button>
          </div>
        </div>
        {(error || chk.errors.length > 0) && <div className="px-4 pb-2 text-[12px] text-neg">{error ?? chk.errors.join(' ')}</div>}
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] items-start max-w-[1650px] mx-auto w-full">
        <div className="min-w-0 flex flex-col gap-3">
          <Panel
            title={`Your PMs · ${active.length}`}
            right={<div className="flex items-center gap-1 text-[11px]"><span className="text-muted mr-1">Scale all risk</span>{[0.5, 0.8, 1.25, 1.5].map((k) => <button key={k} className="btn px-2 py-0.5 num text-[11px]" onClick={() => scaleAll(k)}>×{k}</button>)}</div>}
          >
            {active.length === 0 && <div className="text-[12.5px] text-muted py-2">No PMs on the platform yet. Give risk to PMs pitching below, then run the market.</div>}
            <RowsHeader />
            {active.map((r) => <Row key={r.pm.id} r={r} N={N} jump={jump} onSet={set} onOpen={() => setDetail(r.pm)} />)}
          </Panel>
          <Panel title={`Pitching to you · ${pitching.length}`} right={<span className="text-[11px] text-muted">Records are real — but you only meet PMs whose records look good</span>}>
            <RowsHeader />
            {pitching.map((r) => <Row key={r.pm.id} r={r} N={N} jump={jump} onSet={set} onOpen={() => setDetail(r.pm)} />)}
          </Panel>
          {state.rounds.length > 0 && <History state={state} onOpen={setReport} />}
        </div>

        <div className="lg:sticky lg:top-[64px] flex flex-col gap-3">
          <Platform view={view} N={N} tv={tv} chkWarnings={chk.warnings} state={state} />
        </div>
      </div>

      {detail && <PMDetail pm={state.pms[detail.id]} state={state} onClose={() => setDetail(null)} />}
      {report && <RoundReport record={report} state={state} onClose={() => setReport(null)} />}
      {confirmEnd && (
        <Modal open onClose={() => setConfirmEnd(false)} title="Finish this session?" footer={<>
          <button className="btn" onClick={() => setConfirmEnd(false)}>Keep allocating</button>
          <button className="btn btn-primary" onClick={() => { setConfirmEnd(false); setState(endAllocSession(state)); }}>Finish & reveal</button>
        </>}>
          <p className="text-[13px] text-ink2">Outstanding PM payouts are settled and every PM's true skill is revealed, along with how much of your result came from selection, sizing and stops.</p>
        </Modal>
      )}
    </div>
  );
}

function Top({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="shrink-0">
      <div className="label text-[9.5px]">{label}</div>
      <div className={`num text-[14px] font-semibold leading-tight ${tone ?? ''}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-muted leading-tight">{sub}</div>}
    </div>
  );
}

function RowsHeader() {
  return (
    <div className="hidden xl:grid grid-cols-[minmax(150px,1fr)_minmax(140px,0.9fr)_minmax(140px,0.9fr)_minmax(390px,auto)] gap-3 text-[10px] uppercase tracking-wider text-muted pb-1 border-b border-line">
      <span>PM</span>
      <span>Skill estimate (annual Sharpe)</span>
      <span>Behaviour</span>
      <span>Your allocation</span>
    </div>
  );
}

function Row({ r, N, jump, onSet, onOpen }: { r: PMView; N: number; jump: number; onSet: (id: string, p: Partial<Draft>) => void; onOpen: () => void }) {
  const { pm, est, draft } = r;
  const v = verdict(est.liveT);
  const recT = est.srRaw / (Math.sqrt(52 / Math.max(pm.track.length, 2)));
  const scale = (x: number) => `${((Math.max(-1, Math.min(3, x)) + 1) / 4) * 100}%`;
  const overCap = r.capital > pm.capacity;
  return (
    <div className="grid gap-3 py-2.5 border-b border-line last:border-b-0 grid-cols-1 xl:grid-cols-[minmax(150px,1fr)_minmax(140px,0.9fr)_minmax(140px,0.9fr)_minmax(390px,auto)] items-center">
      <div className="min-w-0">
        <button className="font-semibold text-[13px] hover:text-accent text-left" onClick={onOpen}>{pm.name}</button>
        <div className="text-[11.5px] text-ink2">{pm.style}</div>
        <div className="text-[10.5px] text-muted">{pm.status === 'active' ? `on platform since week ${pm.hiredWeek}` : `pitched week ${pm.pitchWeek}`} · <button className="underline hover:text-accent" onClick={onOpen}>record</button></div>
      </div>
      <div className="min-w-0">
        <div className="relative h-3 rounded-full bg-panel2" title={`90% range ${num(est.lo, 1)} to ${num(est.hi, 1)}`}>
          <div className="absolute inset-y-0 w-px" style={{ left: scale(0), background: 'var(--axis)' }} />
          <div className="absolute inset-y-0 rounded-full" style={{ left: scale(est.lo), width: `calc(${scale(est.hi)} - ${scale(est.lo)})`, background: 'color-mix(in oklab, var(--accent) 30%, transparent)' }} />
          <div className="absolute -inset-y-0.5 w-[3px] rounded" style={{ left: `calc(${scale(est.sr)} - 1.5px)`, background: 'var(--accent)' }} />
          <div className="absolute -inset-y-1 w-[2px]" style={{ left: scale(est.srRaw), background: 'var(--muted)' }} title={`Raw record Sharpe ${num(est.srRaw, 2)}`} />
        </div>
        <div className="text-[11px] num mt-1">
          <b>{num(est.sr, 2)}</b> <span className="text-muted">({num(est.lo, 1)} to {num(est.hi, 1)})</span>
        </div>
        <div className="text-[10.5px] text-muted num">record {num(est.srRaw, 2)} · t {num(recT, 1)} over {pm.track.length}w</div>
      </div>
      <div className="text-[11px] num text-ink2 min-w-0">
        <div>vol {pct(est.vol, 1)} · max DD {pct(est.maxDD, 0)}</div>
        <div>live {pm.live.length}w {signedPct(est.liveRet, 1)} <span className={`font-sans ${v.tone}`}>{pm.live.length > 1 ? v.label : ''}</span></div>
        <div className="font-sans">corr to platform <span className="num">{num(r.corrToPlatform, 2)}</span></div>
        {est.negSkew && <div className="font-sans text-warn">fat left tail: record may flatter</div>}
      </div>
      <div className="min-w-0">
        <div className="flex flex-nowrap items-center gap-1">
          <span className="text-[10.5px] text-muted w-[30px]">risk</span>
          <button className="btn px-2 py-0.5 text-[12px]" onClick={() => onSet(pm.id, { risk: Math.max(0, draft.risk - 0.0025) })} aria-label={`Less risk to ${pm.name}`}>−</button>
          {RISK_CHIPS.map((c) => (
            <button key={c} className={`btn px-1.5 py-0.5 text-[11px] num ${Math.abs(draft.risk - c) < 1e-6 ? 'btn-primary' : ''}`} onClick={() => onSet(pm.id, { risk: c })}>{c === 0 ? '0' : `${(c * 100).toFixed(1).replace('.0', '')}%`}</button>
          ))}
          <button className="btn px-2 py-0.5 text-[12px]" onClick={() => onSet(pm.id, { risk: draft.risk + 0.0025 })} aria-label={`More risk to ${pm.name}`}>+</button>
          <span className="num text-[12px] font-semibold ml-1 w-[44px]">{pct(draft.risk, 2)}</span>
        </div>
        <div className="flex flex-nowrap items-center gap-1 mt-1">
          <span className="text-[10.5px] text-muted w-[30px]">stop</span>
          {STOPS.map((st) => (
            <button key={st} className={`btn px-1.5 py-0.5 text-[11px] num ${draft.stop === st ? 'btn-primary' : ''}`} onClick={() => onSet(pm.id, { stop: st })}>{st < 1 ? `${(st * 100).toFixed(1).replace('.0', '')}%` : 'none'}</button>
          ))}
        </div>
        <div className="text-[10.5px] num mt-1 text-ink2 flex flex-wrap gap-x-2">
          {draft.risk > 0 ? (
            <>
              <span>capital <b className={overCap ? 'text-warn' : 'text-ink'}>{money(r.capital)}</b> ({pct(r.capital / N, 0)} NAV)</span>
              <span>· {pct(Math.max(0, r.riskShare), 0)} of platform risk</span>
              <span className={r.pStop > 0.25 ? 'text-warn' : ''}>· {pct(r.pStop, 0)} chance of stop in {jump}w</span>
            </>
          ) : (
            <span className="text-muted">not allocated · stop at {draft.stop < 1 ? pct(draft.stop, 1) : 'none'} would trigger {pct(r.pStop, 0)} of the time in {jump}w</span>
          )}
          <span className="text-muted">· capacity {money(pm.capacity)}</span>
        </div>
      </div>
    </div>
  );
}

function Platform({ view, N, tv, chkWarnings, state }: { view: ReturnType<typeof platformView>; N: number; tv: number; chkWarnings: string[]; state: AllocState }) {
  const allocated = view.rows.filter((r) => r.capital > 0).sort((a, b) => b.riskShare - a.riskShare);
  const idx = allocated.map((r) => view.ids.indexOf(r.pm.id));
  const name = (id: string) => state.pms[id]?.name ?? id;
  return (
    <>
      <Panel title="Platform plan">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Planned vol" value={pct(view.vol, 1)} sub={`target ${pct(tv, 0)}`} tone={view.vol > tv * 1.1 ? 'text-neg' : ''} />
          <Stat label="Expected excess / yr" value={signedPct(view.expected, 1)} sub={`${signedMoney(view.expected * N)} · before payouts`} />
          <Stat label="Expected Sharpe" value={num(view.sharpe, 2)} sub="from shrunk estimates" />
          <Stat label="Diversification" value={`${num(view.divRatio, 2)}×`} sub="sum of PM risk ÷ platform risk" />
          <Stat label="Capital deployed" value={`${num(view.gross, 2)}× NAV`} sub={`limit ${state.config.maxGross}×`} />
          <Stat label="PMs funded" value={`${allocated.length}`} sub={`payout ${pct(state.config.payout, 0)} of each PM's profit`} />
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted mb-1"><span>Risk used vs target</span><span className="num">{pct(view.vol / tv, 0)}</span></div>
          <Bar value={view.vol} max={tv * 1.5} tone={view.vol > tv * 1.1 ? 'var(--neg-fill)' : 'var(--c1)'} height={8} />
        </div>
        {chkWarnings.map((w) => <div key={w} className="text-[11.5px] text-warn mt-2">⚠ {w}</div>)}
      </Panel>

      {allocated.length > 0 && (
        <Panel title="Where the risk is">
          <div className="space-y-1.5">
            {allocated.map((r) => (
              <div key={r.pm.id} className="grid grid-cols-[minmax(0,1fr)_100px_40px] items-center gap-2 text-[12px]">
                <span className="truncate text-ink2">{r.pm.name} <span className="text-muted">· {r.pm.style}</span></span>
                <Bar value={Math.max(0, r.riskShare)} max={1} tone="var(--c1)" />
                <span className="num text-right">{pct(Math.max(0, r.riskShare), 0)}</span>
              </div>
            ))}
          </div>
          {view.maxPair && view.maxPair.c > 0.3 && (
            <div className="text-[11.5px] text-warn mt-2">{name(view.maxPair.a)} and {name(view.maxPair.b)} move together (correlation {num(view.maxPair.c, 2)}): you may be paying two PMs for one bet.</div>
          )}
          {allocated.length >= 2 && (
            <div className="overflow-x-auto scroll-thin mt-3">
              <div className="label mb-1">Correlation of weekly returns (common history)</div>
              <table className="text-[10px] num border-separate" style={{ borderSpacing: 2 }}>
                <tbody>
                  {idx.map((i, a) => (
                    <tr key={i}>
                      <td className="pr-1 text-right text-ink2 font-sans whitespace-nowrap">{allocated[a].pm.name}</td>
                      {idx.map((j, b) => (
                        <td key={j} className="w-7 h-6 text-center rounded-sm" style={{ background: a === b ? 'var(--panel-2)' : divergingColor(view.corr[i][j]), color: Math.abs(view.corr[i][j]) > 0.55 && a !== b ? '#fff' : 'var(--text-2)' }}>
                          {a === b ? '' : view.corr[i][j].toFixed(1).replace('0.', '.')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10.5px] text-muted mt-1">Correlations are measured in history that may not include a crisis. Crowded styles converge in stress.</div>
            </div>
          )}
        </Panel>
      )}

      <Panel title="How this works">
        <ul className="text-[11.5px] text-ink2 space-y-1 leading-snug list-disc pl-4">
          <li>Give each PM a <b>risk budget</b> (their annual volatility, % of NAV). Capital = budget ÷ the PM's estimated vol.</li>
          <li>PMs keep their capital until they hit your <b>stop</b> (drawdown from their book's peak) or you redeem them. Stopped PMs leave for good.</li>
          <li>The skill estimate shrinks the record toward a typical PM: most PMs who pitch have modest edge. Records under ~2 years are mostly noise.</li>
          <li>PMs are paid {pct(state.config.payout, 0)} of their own profits each year — even when the platform loses.</li>
          <li>After each run you'll see whether your <b>selection</b>, <b>sizing</b> and <b>stops</b> helped, against: {(Object.keys(SHADOW_INFO) as ShadowId[]).map((k) => SHADOW_INFO[k].name.toLowerCase()).join('; ')}.</li>
        </ul>
      </Panel>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-panel2 rounded-md px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`num text-[15px] font-semibold ${tone ?? ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
