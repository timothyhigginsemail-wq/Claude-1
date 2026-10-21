import { useMemo } from 'react';
import { afterStop, estimate, type AllocState } from '../../engine/allocator';
import { Logo } from '../Home';
import { Panel } from '../kit';
import { money, num, pct, signedMoney, signedPct, toneClass } from '../format';
import { CumulativeAttribution, PathChart } from './History';
import { cumulative } from './attribution';

function corr(a: number[], b: number[]) {
  const n = a.length;
  if (n < 3) return NaN;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : NaN;
}

export function AllocReview({ state, onHome, onNew, onToggleTheme }: { state: AllocState; onHome: () => void; onNew: (seed?: string) => void; onToggleTheme: () => void }) {
  const r = useMemo(() => {
    const n0 = state.config.nav0;
    const path = state.book.path;
    const rets = path.slice(1).map((v, i) => v / path[i] - 1);
    const m = rets.reduce((a, x) => a + x, 0) / Math.max(1, rets.length);
    const sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, rets.length - 1));
    const rf = 0.04 / 52;
    let pk = 0, mdd = 0;
    for (const v of path) { pk = Math.max(pk, v); mdd = Math.max(mdd, 1 - v / pk); }
    const weeks = Math.max(1, path.length - 1);
    const totalRet = path[path.length - 1] / n0 - 1;
    const cash = Math.pow(1 + rf, weeks) - 1;
    // average risk weight per PM across rounds (share of your total risk budget)
    const wsum: Record<string, number> = {};
    let rounds = 0;
    for (const rec of state.rounds) {
      const tot = Object.values(rec.budgets).reduce((a, b) => a + b, 0);
      if (tot <= 0) continue;
      rounds++;
      for (const [id, b] of Object.entries(rec.budgets)) wsum[id] = (wsum[id] ?? 0) + b / tot;
    }
    const pms = Object.values(state.pms).filter((p) => p.pitchWeek < state.week);
    const rows = pms.map((p) => {
      const bp = state.book.pms[p.id];
      const atPitch = estimate({ ...p, live: [] });
      return { p, truth: state.truth[p.id].sharpe, recSr: atPitch.srRaw, estAtPitch: atPitch.sr, weight: rounds ? (wsum[p.id] ?? 0) / rounds : 0, pnl: bp?.cum ?? 0, fees: bp?.fees ?? 0, after: afterStop(p, 8) };
    }).sort((a, b) => b.truth - a.truth);
    const consider = rows.filter((x) => x.p.pitchWeek <= (state.rounds[state.rounds.length - 1]?.fromWeek ?? 0));
    const conviction = corr(consider.map((x) => x.weight), consider.map((x) => x.truth));
    const recordVsTruth = corr(consider.map((x) => x.recSr), consider.map((x) => x.truth));
    const stopped = rows.filter((x) => x.p.status === 'stopped');
    const goodStopped = stopped.filter((x) => x.truth > 0.8).length;
    const afterAvg = stopped.filter((x) => x.after !== null).reduce((a, x, _, arr) => a + (x.after ?? 0) / arr.length, 0);
    const fees = Object.values(state.book.pms).reduce((a, b) => a + b.fees, 0);
    const att = cumulative(state.rounds);
    const memo: string[] = [];
    if (isFinite(conviction)) memo.push(conviction > 0.35 ? `Good judgement of skill: your risk weights lined up with PMs' true quality (correlation ${num(conviction, 2)}).` : conviction > 0 ? `Your risk weights were only loosely related to PMs' true quality (correlation ${num(conviction, 2)}).` : `Your risk weights leaned toward the wrong PMs (correlation ${num(conviction, 2)} with true skill).`);
    if (isFinite(recordVsTruth)) memo.push(`For reference, the pitched track records themselves correlated ${num(recordVsTruth, 2)} with true skill — that is the ceiling on what record-reading could tell you.`);
    if (stopped.length) memo.push(`${stopped.length} PM${stopped.length > 1 ? 's were' : ' was'} stopped out; ${goodStopped} of them were genuinely good (true Sharpe > 0.8). In the 8 weeks after being cut they returned ${signedPct(afterAvg, 1)} on average${afterAvg > 0.01 ? ' — your stops were cutting noise' : afterAvg < -0.01 ? ' — your stops avoided further losses' : ''}.`);
    memo.push(`Selection ${signedPct(Math.exp(att.selection) - 1, 1)}, sizing ${signedPct(Math.exp(att.sizing) - 1, 1)}, stops ${signedPct(Math.exp(att.stops) - 1, 1)} relative to a passive equal-risk allocator (${signedPct(Math.exp(att.base) - 1, 1)}).`);
    memo.push(`PM payouts cost ${money(fees)} (${pct(fees / n0, 1)} of starting NAV) — paid to winners even in weeks the platform lost.`);
    return { totalRet, excess: totalRet - cash, sharpe: sd > 0 ? ((m - rf) / sd) * Math.sqrt(52) : 0, mdd, weeks, rows, conviction, fees, memo, cash };
  }, [state]);

  return (
    <div className="min-h-full">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo size={26} />
          <div className="font-semibold">Allocator review · {r.weeks} weeks</div>
          <span className="chip">seed {state.config.seed}</span>
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onToggleTheme}>◐</button>
          <button className="btn" onClick={onHome}>Home</button>
          <button className="btn" onClick={() => onNew(state.config.seed)}>Replay same seed</button>
          <button className="btn btn-primary" onClick={() => onNew()}>New session</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Big l="Final NAV" v={money(state.book.cash)} tone={toneClass(r.totalRet)} />
          <Big l="Return" v={signedPct(r.totalRet, 1)} tone={toneClass(r.totalRet)} />
          <Big l="Over cash" v={signedPct(r.excess, 1)} tone={toneClass(r.excess)} />
          <Big l="Sharpe (ann.)" v={num(r.sharpe, 2)} />
          <Big l="Max drawdown" v={pct(r.mdd, 1)} />
          <Big l="PM payouts" v={money(r.fees)} />
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
          <Panel title="Your platform vs the counterfactual books"><PathChart state={state} height={240} /></Panel>
          <Panel title="What added value">
            <CumulativeAttribution rounds={state.rounds} />
            <ul className="mt-4 space-y-2 text-[12.5px] text-ink2 leading-relaxed list-disc pl-4">
              {r.memo.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </Panel>
        </div>
        <Panel title="Revealed: every PM's true skill">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[12px]">
              <thead className="text-muted text-left">
                <tr>
                  <th className="py-1 font-medium">PM</th>
                  <th className="font-medium text-right">True Sharpe</th>
                  <th className="font-medium text-right">Record at pitch</th>
                  <th className="font-medium text-right">Estimate at pitch</th>
                  <th className="font-medium text-right">Your avg risk share</th>
                  <th className="font-medium text-right">P&L to you</th>
                  <th className="font-medium text-right pr-4">Payouts</th>
                  <th className="font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.p.id} className="border-t border-line">
                    <td className="py-1.5">{x.p.name}<div className="text-[10.5px] text-muted">{x.p.style}</div></td>
                    <td className={`num text-right font-semibold ${x.truth > 0.8 ? 'text-pos' : x.truth < 0.2 ? 'text-neg' : ''}`}>{num(x.truth, 2)}</td>
                    <td className="num text-right">{num(x.recSr, 2)}</td>
                    <td className="num text-right">{num(x.estAtPitch, 2)}</td>
                    <td className="num text-right">{x.weight ? pct(x.weight, 0) : '—'}</td>
                    <td className={`num text-right ${toneClass(x.pnl)}`}>{x.pnl ? signedMoney(x.pnl) : '—'}</td>
                    <td className="num text-right text-muted pr-4">{x.fees ? money(x.fees) : '—'}</td>
                    <td className="text-[11px] text-ink2">{x.p.status === 'stopped' ? `stopped wk ${(x.p.stoppedWeek ?? 0) + 1}${x.after !== null ? ` · next 8w ${signedPct(x.after, 1)}` : ''}` : x.p.status === 'active' ? 'on platform' : x.p.status === 'left' ? 'moved on' : x.p.hiredWeek !== undefined ? 'redeemed' : 'never funded'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-muted mt-2">True Sharpe is the PM's skill while their edge is working; managers can also lose their edge for stretches. Records are survivorship-selected: most pitch with records better than their skill.</div>
        </Panel>
      </main>
    </div>
  );
}

function Big({ l, v, tone }: { l: string; v: string; tone?: string }) {
  return (
    <div className="panel p-3">
      <div className="label">{l}</div>
      <div className={`num text-[17px] font-semibold mt-0.5 ${tone ?? ''}`}>{v}</div>
    </div>
  );
}
