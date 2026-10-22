import { memo, useEffect, useRef, useState } from 'react';

function useWide() {
  const q = '(min-width: 1100px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
import { Action, FeedItem, GameState, absNow, hedgeDelta, acceptAxe, utilisation, timeLabel } from '../engine/game';
import { ASSETS, REGIMES, SPECS, clockLabel } from '../engine/market';
import { bucketTotal } from '../engine/book';
import { clientById } from '../engine/clients';
import { store, useStore } from './store';
import { Avatar, Icon, Wordmark, kfmt, pnlCls, sgnUsd, who } from './common';
import { Ring, Sparkline } from './charts';
import { RfqSheet } from './RfqSheet';
import { HedgeSheet } from './HedgeSheet';
import { BookSheet, PositionSheet } from './BookSheet';
import { RiskSheet, RiskPanel } from './RiskSheet';
import { MarketsSheet, MarketsPanel } from './MarketsSheet';
import { LabSheet } from './LabSheet';
import { LearnSheet } from './LearnSheet';
import { PnlSheet } from './PnlSheet';
import { DayReportView } from './DayReport';
import { MenuSheet } from './MenuSheet';

export function runAction(a: Action) {
  const g = store.g;
  if (!g) return;
  switch (a.t) {
    case 'rfq':
      store.open('rfq', a.id);
      break;
    case 'sheet':
      store.open(a.s, a.arg);
      break;
    case 'learn':
      store.learn(a.topic);
      break;
    case 'lab':
      store.lab(a.preset);
      break;
    case 'hedgeDelta': {
      const r = store.act((g) => hedgeDelta(g, a.asset));
      store.toast(r ? `${SPECS[a.asset].name} delta flattened` : `${SPECS[a.asset].name} delta already flat`);
      break;
    }
    case 'axe':
      store.act((g) => acceptAxe(g, a.id));
      break;
  }
}

export function Desk() {
  const { g, ui } = useStore();
  const wide = useWide();
  if (!g) return null;
  return (
    <div className="app">
      <TopBar g={g} />
      <Spine g={g} />
      <div className="main">
        {wide && (
          <div className="sidecol only-desk" style={{ flexDirection: 'column' }}>
            <MarketsPanel g={g} compact />
          </div>
        )}
        <Feed g={g} />
        {wide && (
          <div className="sidecol only-desk" style={{ flexDirection: 'column' }}>
            <RiskPanel g={g} compact />
          </div>
        )}
      </div>
      <Dock g={g} />
      {ui.sheet === 'rfq' && ui.arg && <RfqSheet g={g} id={ui.arg} />}
      {ui.sheet === 'hedge' && <HedgeSheet g={g} />}
      {ui.sheet === 'book' && <BookSheet g={g} />}
      {ui.sheet === 'position' && ui.arg && <PositionSheet g={g} id={ui.arg} />}
      {ui.sheet === 'risk' && <RiskSheet g={g} />}
      {ui.sheet === 'markets' && <MarketsSheet g={g} initial={ui.arg} />}
      {ui.sheet === 'lab' && <LabSheet g={g} preset={ui.labPreset} />}
      {ui.sheet === 'learn' && <LearnSheet g={g} topic={ui.learn} />}
      {ui.sheet === 'pnl' && <PnlSheet g={g} />}
      {ui.sheet === 'menu' && <MenuSheet g={g} />}
      {(g.phase === 'closed' || g.phase === 'over') && <DayReportView g={g} />}
      {ui.toast && <div className="toast">{ui.toast}</div>}
    </div>
  );
}

function TopBar({ g }: { g: GameState }) {
  const m = g.market;
  const R = REGIMES[m.regime];
  const sp = g.settings.speed;
  const progress = m.tick / 102;
  return (
    <div className="topbar">
      <div className="wordmark">
        <Wordmark />
        <span className="hide-desk" style={{ display: 'none' }}>CONVEXITY</span>
        <span className="only-desk">CONVEXITY</span>
      </div>
      <div className="clock">
        <Ring value={progress} size={30} stroke={2.5} color={m.regime === 'crisis' ? '#ff6b4a' : '#d7f75b'}>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>D{m.day + 1}</span>
        </Ring>
        <div>
          <div className="clock-time">{clockLabel(m.tick)}</div>
          <div className={`regime ${m.regime}`} style={{ padding: '0 6px', fontSize: 9.5, border: 0 }}>{R.label}</div>
        </div>
        <div className="speed">
          <button className="play" onClick={() => store.setSpeed(sp === 0 ? 1 : 0)} aria-label={sp === 0 ? 'Play' : 'Pause'}>
            <Icon name={sp === 0 ? 'play' : 'pause'} size={14} />
          </button>
          {[1, 2, 4].map((s) => (
            <button key={s} className={sp === s ? 'on' : ''} onClick={() => store.setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button className="iconbtn" onClick={() => store.open('menu')} aria-label="Menu">
          <Icon name="menu" />
        </button>
      </div>
    </div>
  );
}

function Spine({ g }: { g: GameState }) {
  const R = g.book.risk;
  const today = bucketTotal(g.book.today);
  const u = utilisation(g);
  const util = (key: string, asset?: string) => u.find((x) => x.key === key && (asset === undefined || x.asset === asset))?.util ?? 0;
  const barCol = (x: number) => (x > 1 ? 'var(--down)' : x > 0.8 ? 'var(--warn)' : 'var(--ink4)');
  const eqGamma = R.gamma.ORX + R.gamma.NKT + R.gamma.AUR;
  const vegaTot = ASSETS.reduce((s, a) => s + R.vega[a], 0);
  const topDelta = ASSETS.slice().sort((a, b) => util('delta', b) - util('delta', a))[0];
  const chips: { k: string; label: string; v: string; cls?: string; util?: number; onClick: () => void; big?: boolean; spark?: number[] }[] = [
    { k: 'pnl', label: 'P&L today', v: sgnUsd(today), cls: pnlCls(today), onClick: () => store.open('pnl'), big: true, spark: g.book.intradayPnl },
    { k: 'delta', label: `Δ ${SPECS[topDelta].name} /1%`, v: kfmt(R.delta[topDelta]), util: util('delta', topDelta), onClick: () => store.open('risk') },
    { k: 'gamma', label: 'Γ eq /1%', v: kfmt(eqGamma), cls: eqGamma < -1000 ? 'down' : eqGamma > 1000 ? 'up' : '', util: util('gamma'), onClick: () => store.learn('gamma') },
    { k: 'vega', label: 'ν /vol pt', v: kfmt(vegaTot), util: util('vega'), onClick: () => store.open('risk') },
    { k: 'theta', label: 'Θ /day', v: kfmt(R.theta), cls: pnlCls(R.theta), onClick: () => store.learn('theta') },
    { k: 'corr', label: 'ρ /pt', v: kfmt(R.corr01), onClick: () => store.learn('correlation') },
    { k: 'dv01', label: 'DV01', v: kfmt(R.dv01), onClick: () => store.open('risk') },
    { k: 'var', label: 'VaR 99', v: kfmt(g.varRes.var99), util: util('var99'), onClick: () => store.open('risk') },
  ];
  return (
    <div className="spine">
      {chips.map((c) => (
        <button key={c.k} className={`chip ${c.big ? 'big' : ''} ${(c.util ?? 0) > 1 ? 'alert' : ''}`} onClick={c.onClick}>
          <span className="micro">{c.label}</span>
          <div className="row" style={{ gap: 6 }}>
            <span className={`v ${c.cls ?? ''}`}>{c.v}</span>
            {c.spark && c.spark.length > 2 && <Sparkline data={c.spark} width={44} height={18} base={0} />}
          </div>
          {c.util !== undefined && <span className="bar" style={{ width: `${Math.min(100, c.util * 100)}%`, background: barCol(c.util) }} />}
        </button>
      ))}
    </div>
  );
}

function Feed({ g }: { g: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const n = g.feed.length;
  const lastId = g.feed[n - 1]?.id;
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  const items: (FeedItem | { sep: number })[] = [];
  let day = -1;
  for (const f of g.feed.slice(-120)) {
    if (f.day !== day) {
      items.push({ sep: f.day });
      day = f.day;
    }
    items.push(f);
  }
  return (
    <div
      className="feed"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {items.map((it) => {
        if ('sep' in it) return <div key={`sep${it.sep}`} className="daysep micro">Day {it.sep + 1}</div>;
        if (it.kind === 'rfq') return <RfqCard key={it.id} f={it} g={g} />;
        return <MemoRow key={it.id} f={it} />;
      })}
      <div style={{ minHeight: 8 }} />
    </div>
  );
}

function Actions({ f }: { f: FeedItem }) {
  if (!f.actions?.length) return null;
  return (
    <div className="actions">
      {f.actions.map((a, i) => (
        <button key={i} className={`pill ${i === 0 ? 'acc' : ''}`} onClick={() => runAction(a.act)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

const MemoRow = memo(FeedRow, (a, b) => a.f === b.f);
function FeedRow({ f }: { f: FeedItem }) {
  const t = clockLabel(f.tick);
  if (f.kind === 'news')
    return (
      <div className="newsline">
        <span className="t">{t}</span>
        <span className="newsdot" style={{ background: f.tone === 'neg' ? 'var(--down)' : f.tone === 'pos' ? 'var(--up)' : 'var(--ink4)' }} />
        <span>{f.text}</span>
      </div>
    );
  if (f.kind === 'event')
    return (
      <div className={`eventcard ${f.tone === 'warn' ? 'warn' : ''}`}>
        <div className="between" style={{ marginBottom: 4 }}>
          <span className="micro" style={{ color: f.tone === 'warn' ? 'var(--down)' : 'var(--acc)' }}>
            {f.tone === 'warn' ? 'Breaking' : 'Release'}
          </span>
          <span className="mono muted" style={{ fontSize: 10.5 }}>{t}</span>
        </div>
        <div style={{ fontWeight: 500 }}>{f.text}</div>
      </div>
    );
  if (f.kind === 'fill' || f.kind === 'life' || f.kind === 'system')
    return (
      <div className={`fillline ${f.tone === 'pos' ? 'pos' : f.tone === 'warn' ? 'warn' : ''}`}>
        <span className="mono muted" style={{ fontSize: 10.5, paddingTop: 2 }}>{t}</span>
        <div className="grow">
          <div style={{ color: f.tone === 'pos' ? 'var(--ink)' : 'var(--ink2)' }}>{f.text}</div>
          <Actions f={f} />
        </div>
      </div>
    );
  const w = who(f.from);
  return (
    <div className="msg">
      <Avatar id={f.from ?? 'desk'} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-head">
          <span className="msg-name">{w.name}</span>
          <span className="msg-role">{w.role}</span>
          <span className="msg-time">{t}</span>
        </div>
        <div className={`bubble ${f.tone ?? ''}`}>
          {f.text}
          <Actions f={f} />
        </div>
      </div>
    </div>
  );
}

function RfqCard({ f, g }: { f: FeedItem; g: GameState }) {
  const r = g.rfqs.find((x) => x.id === f.rfqId);
  if (!r) return <div className="rfqcard closed"><div className="prod">{f.text}</div></div>;
  const c = clientById(r.client);
  const now = absNow(g);
  const created = r.day * 103 + r.tick;
  const left = Math.max(0, r.expires - now);
  const total = Math.max(1, r.expires - created);
  const live = r.status === 'open';
  const statusTag = { open: ['Live', 'acc'], quoted: ['Quoted', 'warn'], won: ['Done', 'up'], lost: ['Lost', 'down'], passed: ['Passed', ''], expired: ['Expired', 'down'] }[r.status];
  return (
    <div className={`rfqcard ${live || r.status === 'quoted' ? '' : 'closed'}`}>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <span className="micro" style={{ color: 'var(--acc)' }}>RFQ · {clockLabel(f.tick)}</span>
          <span className={`tag ${statusTag[1]}`}>{statusTag[0]}</span>
          {r.big && <span className="tag warn">Big ticket</span>}
        </div>
        <div className="client">{c.name}</div>
        <div className="prod">{f.text.replace(c.name + ' ', '').split('. ')[0]}</div>
        {live && <div className="note">{r.note}</div>}
        {r.outcome && <div className="note" style={{ color: r.status === 'won' ? 'var(--up)' : 'var(--ink3)' }}>{r.outcome}</div>}
      </div>
      <div className="col" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {live ? (
          <Ring value={left / total} size={40} stroke={3} color={left / total < 0.3 ? '#ff6b4a' : '#d7f75b'}>
            <span className="mono" style={{ fontSize: 10 }}>{left * 5}m</span>
          </Ring>
        ) : (
          <Avatar id={r.client} size={36} />
        )}
        {(live || r.status === 'quoted') && (
          <button className={`pill ${live ? 'solid' : ''}`} onClick={() => store.open('rfq', r.id)}>
            {live ? 'Price it' : 'View'} <Icon name="chev" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function Dock({ g }: { g: GameState }) {
  const { ui } = useStore();
  const open = g.rfqs.filter((r) => r.status === 'open').length;
  const breaches = g.breaches.length;
  const items: [string, string, string, number?][] = [
    ['markets', 'markets', 'Markets'],
    ['book', 'book', 'Book', open],
    ['hedge', 'hedge', 'Hedge'],
    ['risk', 'risk', 'Risk', breaches],
    ['lab', 'lab', 'Lab'],
  ];
  return (
    <nav className="dock">
      {items.map(([s, icon, label, badge]) => (
        <button key={s} className={`${s === 'hedge' ? 'hero' : ''} ${ui.sheet === s ? 'on' : ''}`} onClick={() => (s === 'lab' ? store.lab() : store.open(s as never))}>
          <Icon name={icon} size={s === 'hedge' ? 20 : 18} />
          <span>{label}</span>
          {badge ? <span className="badge">{badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export { timeLabel };
