import { useState } from 'react';
import { GameState, tick, forceRegime, triggerEvent } from '../engine/game';
import { EventKind, REGIMES, RegimeId } from '../engine/market';
import { LEVELS } from '../engine/career';
import { EVENT_INFO } from '../engine/events';
import { store } from './store';
import { Seg, Sheet } from './common';

export function MenuSheet({ g }: { g: GameState }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title="Desk menu" sub={`${g.mode} · seed ${g.seed} · ${LEVELS[g.career.level].title}`}>
      <div className="card">
        <div className="micro" style={{ marginBottom: 8 }}>Settings</div>
        <div className="between" style={{ fontSize: 13.5 }}>
          <span>Pause the clock while pricing</span>
          <Seg value={g.settings.pauseOnTicket ? 1 : 0} onChange={(x) => store.act((g) => (g.settings.pauseOnTicket = x === 1))} options={[[1, 'On'], [0, 'Off']]} />
        </div>
      </div>
      <div className="col">
        <button className="btn" onClick={() => store.learn('')}>Desk notes (learning library)</button>
        <button className="btn" onClick={() => store.open('pnl')}>P&L attribution</button>
        {g.phase === 'trading' && (
          <button className="btn" onClick={() => (confirm ? (store.act((g) => { let n = 0; while (g.phase === 'trading' && n++ < 200) tick(g); }), store.open(null)) : setConfirm(true))}>
            {confirm ? 'Tap again: run the market to the close (open RFQs will lapse)' : 'Fast-forward to the close'}
          </button>
        )}
        <button className="btn" onClick={() => { store.save(); store.toast('Saved'); }}>Save</button>
        <button className="btn danger" onClick={() => store.exit()}>Save & exit to title</button>
      </div>
      {g.mode === 'sandbox' && <SandboxControls g={g} />}
    </Sheet>
  );
}

function SandboxControls({ g }: { g: GameState }) {
  const kinds: EventKind[] = ['fed', 'cpi', 'ecb', 'earnings', 'shock_selloff', 'shock_single', 'shock_liquidity', 'shock_vol_crush', 'shock_fx'];
  return (
    <div className="card">
      <div className="micro" style={{ marginBottom: 8 }}>Sandbox controls</div>
      <div className="field">
        <label>Regime (held until released)</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {(Object.keys(REGIMES) as RegimeId[]).map((r) => (
            <button key={r} className={`pill ${g.market.regime === r && g.market.forced ? 'acc' : ''}`} onClick={() => store.act((g) => forceRegime(g, r))}>{REGIMES[r].label}</button>
          ))}
          <button className="pill" onClick={() => store.act((g) => forceRegime(g, null))}>Release</button>
        </div>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Fire an event now</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {kinds.map((k) => (
            <button key={k} className="pill" onClick={() => { store.act((g) => triggerEvent(g, k)); store.open(null); }}>{EVENT_INFO[k].label}</button>
          ))}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Event outcomes come from the seed, so the same seed gives the same surprise. Re-run with a different seed for different draws.</div>
    </div>
  );
}
