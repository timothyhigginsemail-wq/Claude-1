import { useState } from 'react';
import type { GameState } from '../../engine/game';
import { IND_INFO, REGIMES, REGIME_SPECS, type IndKey } from '../../engine/market';
import { Panel } from '../kit';
import { pct } from '../format';

export function Briefing({ state }: { state: GameState }) {
  const [open, setOpen] = useState(true);
  const prev = state.history.length ? state.history[state.history.length - 1] : null;
  const prevInd = state.history.length > 1 ? state.history[state.history.length - 2].indicators : null;
  const sorted = REGIMES.slice().sort((a, b) => state.belief[b] - state.belief[a]);
  const showRegimes = state.config.level > 1 || state.config.regimes === 'full';
  return (
    <Panel
      title={`Market briefing · turn ${state.turn}`}
      right={<button className="btn btn-ghost text-[11px] px-2 py-0.5" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>}
    >
      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Tape label="EQX index" value={state.tape.EQX.toFixed(0)} />
            <Tape label="10Y yield" value={`${state.tape.UST10.toFixed(2)}%`} />
            <Tape label="Cash rate" value={`${state.tape.rf.toFixed(2)}%`} />
            {(Object.keys(IND_INFO) as IndKey[]).map((k) => {
              const v = state.indicators[k];
              const before = prev ? (prevInd ? prevInd[k] : REGIME_SPECS.normal.ind[k]) : null;
              const d = before !== null ? v - before : 0;
              return <Tape key={k} label={IND_INFO[k].name} value={`${k === 'TRD' ? v.toFixed(2) : v.toFixed(k === 'VLX' ? 1 : 0)}${IND_INFO[k].unit === 'bp' ? 'bp' : ''}`} delta={before !== null ? d : undefined} />;
            })}
            <Tape label="Oil" value={`$${state.tape.OIL.toFixed(1)}`} />
          </div>

          {showRegimes && (
            <div>
              <div className="label mb-1.5 flex justify-between"><span>Desk regime read</span><span className="normal-case tracking-normal font-normal">P(current regime | indicators)</span></div>
              <div className="space-y-1">
                {sorted.slice(0, 4).map((r) => (
                  <div key={r} className="grid grid-cols-[1fr_90px_38px] items-center gap-2 text-[11.5px]" title={REGIME_SPECS[r].blurb}>
                    <span className="truncate text-ink2">{REGIME_SPECS[r].name}</span>
                    <div className="h-1.5 rounded-full bg-panel2">
                      <div className="h-full rounded-full" style={{ width: `${state.belief[r] * 100}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="num text-right">{pct(state.belief[r], 0)}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10.5px] text-muted mt-1.5 leading-snug">
                The true regime is hidden. This is a Bayesian filter on the indicators above; some regimes (e.g. structural alpha decay) look identical to normal markets.
              </div>
            </div>
          )}

          <div>
            <div className="label mb-1.5">News</div>
            <ul className="space-y-1.5">
              {state.news.map((n, i) => (
                <li key={i} className="text-[12px] leading-snug flex gap-2">
                  <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: n.tone === 'neg' ? 'var(--neg-fill)' : n.tone === 'pos' ? 'var(--pos-fill)' : 'var(--muted)' }} />
                  <span className="text-ink2">{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Tape({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="bg-panel2 rounded-md px-2 py-1.5 min-w-0">
      <div className="text-[9.5px] uppercase tracking-wider text-muted truncate">{label}</div>
      <div className="num text-[12.5px] font-semibold flex items-baseline gap-1">
        {value}
        {delta !== undefined && Math.abs(delta) > 1e-9 && <span className={`text-[10px] ${delta > 0 ? 'text-ink2' : 'text-ink2'}`}>{delta > 0 ? '▲' : '▼'}</span>}
      </div>
    </div>
  );
}
