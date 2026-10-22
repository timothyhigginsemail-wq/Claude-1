import { GameState } from '../engine/game';
import { SPECS } from '../engine/market';
import { LEVELS } from '../engine/career';
import { challengeById } from '../engine/scenarios';
import { bookValue } from '../engine/book';
import { store } from './store';
import { LearnLink, kfmt, pct, pnlCls, sgnUsd, usd } from './common';
import { SignedBars } from './charts';
import { attributionItems } from './PnlSheet';

export function DayReportView({ g }: { g: GameState }) {
  const r = g.report;
  const over = g.phase === 'over';
  const ch = g.challengeId ? challengeById(g.challengeId) : null;
  const score = over && ch ? ch.score(g) : null;
  const rev = g.review;
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="between">
          <span className="micro">{over ? (g.career.fired ? 'Career over' : ch ? 'Challenge complete' : 'Session over') : `End of day ${(r?.day ?? 0) + 1}`}</span>
          <span className="micro">{LEVELS[g.career.level].title}</span>
        </div>
        {score && ch && (
          <div className="card" style={{ borderColor: 'rgba(215,247,91,.4)' }}>
            <div className="micro">{ch.title}</div>
            <div className="row" style={{ alignItems: 'baseline', gap: 12, margin: '6px 0' }}>
              <span className="hero-num acc">{score.grade}</span>
              <span className="mono" style={{ fontSize: 20 }}>{score.score}/100</span>
            </div>
            {score.lines.map((l) => <div key={l} className="dim" style={{ fontSize: 13.5 }}>{l}</div>)}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{ch.objective}</div>
          </div>
        )}
        {r && (
          <>
            <div>
              <div className={`hero-num ${pnlCls(r.pnl)}`}>{sgnUsd(r.pnl)}</div>
              <div className="dim" style={{ marginTop: 4 }}>Book total {sgnUsd(bookValue(g.book))} · client edge {sgnUsd(r.buckets.edge)} · costs {sgnUsd(r.buckets.costs)}</div>
            </div>
            <div className="grid3">
              {r.moves.map((m) => (
                <div key={m.asset} className="stat">
                  <div className="micro">{SPECS[m.asset].name}</div>
                  <div className={`v ${m.ret >= 0 ? 'up' : 'down'}`}>{pct(m.ret)}</div>
                  <div className="s">vol {m.volChg >= 0 ? '+' : ''}{m.volChg.toFixed(1)} · RV-day {m.rv.toFixed(2)}%</div>
                </div>
              ))}
              <div className="stat"><div className="micro">RFQs</div><div className="v">{r.rfq.won}/{r.rfq.quoted}</div><div className="s">won / quoted of {r.rfq.seen}</div></div>
              <div className="stat"><div className="micro">Theta</div><div className={`v ${pnlCls(r.theta)}`}>{kfmt(r.theta)}</div><div className="s">per day, tonight</div></div>
            </div>
            <div className="card">
              <div className="card-title"><span className="micro">Where it came from</span><LearnLink topic="pnlexplain" label="P&L explain" /></div>
              <SignedBars items={attributionItems(r.buckets).filter((x) => Math.abs(x.value) > 1)} fmt={(x) => sgnUsd(x)} />
            </div>
            <div className="col" style={{ gap: 8 }}>
              <span className="micro">Margot's notes</span>
              {r.notes.map((n, i) => (
                <div key={i} className={`note-card ${n.tone}`}>
                  <i />
                  <div>
                    {n.text}
                    {n.topic && <div style={{ marginTop: 6 }}><LearnLink topic={n.topic} label="Go deeper" /></div>}
                  </div>
                </div>
              ))}
            </div>
            {r.gammaTheta && (
              <div className="card">
                <div className="micro" style={{ marginBottom: 6 }}>Gamma vs theta · {SPECS[r.gammaTheta.asset].name}</div>
                <div className="kv">
                  <span>Gamma ($ per 1%)</span><span>{kfmt(r.gammaTheta.gamma)}</span>
                  <span>Break-even daily move</span><span>{r.gammaTheta.breakeven.toFixed(2)}%</span>
                  <span>Realised (intraday)</span><span className={(r.gammaTheta.gamma < 0) === r.gammaTheta.realized < r.gammaTheta.breakeven ? 'up' : 'down'}>{r.gammaTheta.realized.toFixed(2)}%</span>
                </div>
              </div>
            )}
            {r.positions.length > 0 && (
              <div className="card">
                <div className="micro" style={{ marginBottom: 6 }}>Biggest contributors</div>
                {r.positions.slice(0, 6).map((p, i) => (
                  <div key={i} className="between" style={{ fontSize: 13, padding: '4px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                    <span className="grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label} <span className="muted">· {p.source}</span></span>
                    <span className={`mono ${pnlCls(p.pnl)}`}>{sgnUsd(p.pnl)}</span>
                  </div>
                ))}
              </div>
            )}
            {r.events.length > 0 && (
              <div className="card">
                <div className="micro" style={{ marginBottom: 6 }}>What happened</div>
                {r.events.map((e, i) => <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>{e}</div>)}
              </div>
            )}
          </>
        )}
        {rev && (
          <div className="card" style={{ borderColor: rev.verdict === 'promoted' ? 'rgba(70,220,192,.5)' : rev.verdict === 'held' ? 'var(--line2)' : 'rgba(255,107,74,.5)' }}>
            <div className="between"><span className="micro">Weekly review</span><span className={`tag ${rev.verdict === 'promoted' ? 'up' : rev.verdict === 'held' ? '' : 'down'}`}>{rev.verdict}</span></div>
            <div className="row" style={{ alignItems: 'baseline', gap: 10, margin: '6px 0 8px' }}>
              <span className="hero-num">{rev.total}</span><span className="muted">/ 100</span>
            </div>
            <div className="col" style={{ gap: 6 }}>
              {rev.scores.map((s) => (
                <div key={s.label}>
                  <div className="between" style={{ fontSize: 13 }}><span>{s.label}</span><span className="mono">{s.score}</span></div>
                  <div className="meter"><i style={{ width: `${s.score}%`, background: s.score >= 60 ? 'var(--up)' : s.score >= 35 ? 'var(--warn)' : 'var(--down)' }} /></div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{s.note}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 14 }}>“{rev.text}” <span className="muted">— Margot</span></div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Week P&L {sgnUsd(rev.pnl)} vs target {usd(LEVELS[Math.max(0, g.career.level - (rev.verdict === 'promoted' ? 1 : 0))].weeklyTarget)}. Promotion needs 62+ with positive P&L and at most one breach.</div>
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          {!over && <button className="btn primary grow" onClick={() => store.nextDay()}>Next day →</button>}
          {over && ch && <button className="btn primary grow" onClick={() => store.start('challenge', { challengeId: ch.id })}>Retry (same seed)</button>}
          <button className={`btn ${over ? '' : 'ghost'}`} onClick={() => store.exit()}>{over ? 'Menu' : 'Save & exit'}</button>
        </div>
      </div>
    </div>
  );
}
