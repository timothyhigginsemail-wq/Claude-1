import { useState } from 'react';
import { CHALLENGES } from '../engine/scenarios';
import { LEVELS } from '../engine/career';
import { REGIMES, RegimeId, seedFrom } from '../engine/market';
import { store } from './store';
import { Icon, Seg, Wordmark } from './common';

export function Menu() {
  const [view, setView] = useState<'home' | 'challenges' | 'sandbox' | 'how'>('home');
  const career = store.hasSave('career');
  const sandbox = store.hasSave('sandbox');
  const [seed, setSeed] = useState('');
  const [regime, setRegime] = useState<RegimeId>('calm');
  return (
    <div className="menu">
      <div className="menu-inner">
        <div className="row" style={{ gap: 12, marginTop: 8 }}>
          <Wordmark size={44} />
          <div>
            <div className="title-mark">CONVEXITY</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Cross-asset exotics desk · Halden Wray, London</div>
          </div>
        </div>
        <CurveArt />
        {view === 'home' && (
          <>
            <div className="dim" style={{ fontSize: 14.5 }}>
              Price client trades, warehouse the risk, hedge what you can't afford to keep. The market is seeded and honest. Your P&L comes from your decisions and your exposures, and the debrief shows you which.
            </div>
            {career && (
              <button className="mode-card primary" onClick={() => store.load('career')}>
                <span className="ico"><Icon name="play" /></span>
                <div><h4>Continue career</h4><p>Day {career.day} · {LEVELS[career.level].title}</p></div>
                <Icon name="chev" />
              </button>
            )}
            <button className={`mode-card ${career ? '' : 'primary'}`} onClick={() => store.start('career')}>
              <span className="ico"><Icon name="career" /></span>
              <div><h4>{career ? 'New career' : 'Start your career'}</h4><p>First day as a junior trader. Vanillas, small limits, a mentor watching. Earn promotion to worst-of autocallables.</p></div>
              <Icon name="chev" />
            </button>
            <button className="mode-card" onClick={() => setView('challenges')}>
              <span className="ico"><Icon name="trophy" /></span>
              <div><h4>Challenges</h4><p>Five seeded, replayable scenarios with transparent scoring.</p></div>
              <Icon name="chev" />
            </button>
            <button className="mode-card" onClick={() => setView('sandbox')}>
              <span className="ico"><Icon name="sandbox" /></span>
              <div><h4>Sandbox</h4><p>Every product, desk-head limits, regime and event controls.{sandbox ? ` Saved session: day ${sandbox.day}.` : ''}</p></div>
              <Icon name="chev" />
            </button>
            <button className="mode-card" onClick={() => setView('how')}>
              <span className="ico"><Icon name="learn" /></span>
              <div><h4>How the desk works</h4><p>Two minutes before your first day.</p></div>
              <Icon name="chev" />
            </button>
          </>
        )}
        {view === 'challenges' && (
          <>
            <button className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => setView('home')}>← Back</button>
            {CHALLENGES.map((c) => (
              <button key={c.id} className="mode-card" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => store.start('challenge', { challengeId: c.id })}>
                <div>
                  <h4>{c.title}</h4>
                  <p style={{ color: 'var(--acc)' }}>{c.tagline}</p>
                  <p style={{ marginTop: 6 }}>{c.brief}</p>
                  <p style={{ marginTop: 6, color: 'var(--ink2)' }}>{c.objective}</p>
                  <p style={{ marginTop: 4 }} className="mono">{c.days} day{c.days > 1 ? 's' : ''} · seed {c.seed}</p>
                </div>
                <Icon name="chev" />
              </button>
            ))}
          </>
        )}
        {view === 'sandbox' && (
          <>
            <button className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => setView('home')}>← Back</button>
            {sandbox && (
              <button className="mode-card primary" onClick={() => store.load('sandbox')}>
                <span className="ico"><Icon name="play" /></span>
                <div><h4>Continue sandbox</h4><p>Day {sandbox.day}</p></div>
                <Icon name="chev" />
              </button>
            )}
            <div className="card col">
              <div className="field"><label>Seed (blank = random, text works too)</label><input className="input" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 1987 or volmageddon" /></div>
              <div className="field"><label>Starting regime</label><Seg value={regime} onChange={setRegime} options={(Object.keys(REGIMES) as RegimeId[]).map((r) => [r, REGIMES[r].label] as [RegimeId, string])} /></div>
              <button className="btn primary" onClick={() => store.start('sandbox', { seed: seed.trim() ? seedFrom(seed.trim()) : undefined, regime })}>Open sandbox</button>
            </div>
          </>
        )}
        {view === 'how' && (
          <>
            <button className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => setView('home')}>← Back</button>
            <div className="card prose" style={{ fontSize: 14 }}>
              <b>The floor.</b> Your feed is the desk: sales bring client RFQs, the strategist briefs you, risk chases your limits, the quant explains models, Theo offers inter-desk liquidity. Buttons in messages do real things.{'\n\n'}
              <b>The strip.</b> Along the top is your live risk: P&L, delta, gamma, vega, theta, correlation, DV01, VaR. Bars show limit usage. Tap any chip.{'\n\n'}
              <b>Quoting.</b> Open an RFQ and the clock stops. Our model gives the fair mid, and you choose your margin. Too wide and the client trades elsewhere. Too tight and you get nothing for the risk. Winning books the position into your risk.{'\n\n'}
              <b>Hedging.</b> Futures and shares for delta, listed options for gamma and vega, swaps for DV01. Every hedge pays spread, which widens in stress. Band auto-hedging is in the Hedge sheet.{'\n\n'}
              <b>The day.</b> A trading day runs about two minutes at 1×. Scheduled releases move markets at known times, and options price that in. Unscheduled shocks also happen. Rumours sometimes come first, and sometimes they're false alarms.{'\n\n'}
              <b>The debrief.</b> At the close every dollar is attributed: edge, costs, delta, gamma, vega, theta, rates, correlation, carry, unexplained. Each Friday Margot reviews you on risk-adjusted P&L, client franchise, discipline and execution.
            </div>
          </>
        )}
        <div className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 10 }}>All markets, clients and institutions are fictional and simulated.</div>
      </div>
    </div>
  );
}

function CurveArt() {
  // a convex payoff, drawn as the game's emblem: hockey-stick at expiry vs smooth value today
  const w = 520;
  const h = 120;
  const today: string[] = [];
  const exp: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = i / 60;
    const s = (x - 0.55) * 6;
    const v = Math.log(1 + Math.exp(s * 1.6)) / 1.6;
    today.push(`${(x * w).toFixed(1)},${(h - 12 - v * 22).toFixed(1)}`);
    exp.push(`${(x * w).toFixed(1)},${(h - 12 - Math.max(0, s) * 22).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', margin: '-4px 0 2px' }}>
      <polyline points={exp.join(' ')} fill="none" stroke="#57534a" strokeWidth={1.5} strokeDasharray="4 4" />
      <polyline points={today.join(' ')} fill="none" stroke="#d7f75b" strokeWidth={2.5}>
        <animate attributeName="stroke-dasharray" from="0 1200" to="1200 0" dur="1.6s" fill="freeze" />
      </polyline>
    </svg>
  );
}
