import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { executeStreet, unitNotional } from '../engine/book';
import { isFuture } from '../engine/pricing';
import type { DayReport, DeskId, GameState, Trader } from '../engine/types';
import { closeDay, startGame, totalPnlToday, unwindFraction } from '../game/day';
import { autoHedge } from '../game/flow';
import { fire, hire, launchDecision, resolveDecision, setCapital, upgradeTech } from '../game/manage';
import { executeHedge, passRfq, sendQuote, type HedgeIdea, type QuoteResult } from '../game/rfq';
import { SAVE_VERSION } from '../game/setup';
import { advanceTo, CLOSE_MIN, syncMarket } from '../game/live';

const KEY = 'atlas-markets-save-v' + SAVE_VERSION;

export type Speed = 0 | 1 | 3 | 10;

interface Ctx {
  s: GameState | null;
  v: number;
  /** Bumped on every change except clock ticks (for expensive derived data such as VaR). */
  rv: number;
  /** Market minutes per real second; 0 = paused. */
  speed: Speed;
  setSpeed: (x: Speed) => void;
  /** RFQ currently open on screen: it doesn't lapse while the client is waiting on you. */
  holdRfq: (id: string | null) => void;
  /** Day report on screen (shown wherever you are when you book the day). */
  report: DayReport | null;
  dismissReport: () => void;
  toast: { id: number; text: string; tone: 'good' | 'bad' | 'neutral' } | null;
  notify: (text: string, tone?: 'good' | 'bad' | 'neutral') => void;
  /** Today's P&L sampled through the day, for the live chart. */
  pnlPath: number[];
  loaded: boolean;
  start: (seed: number, d: GameState['difficulty']) => void;
  quote: (rfqId: string, q: number, coupon?: number) => QuoteResult | null;
  pass: (rfqId: string) => void;
  hedge: (desk: DeskId, idea: HedgeIdea) => number;
  trade: (desk: DeskId, instId: string, qty: number) => number;
  unwind: (desk: DeskId, instId: string, frac: number) => number;
  neutralise: (desk: DeskId) => number;
  close: () => DayReport | null;
  decide: (id: string, opt: string) => string;
  capital: (desk: DeskId, amt: number) => string;
  deskParam: (desk: DeskId, patch: { flowSpread?: number; autoHedge?: number }) => void;
  tech: (desk: DeskId) => string;
  hireT: (t: Trader) => string;
  fireT: (id: string) => string;
  launch: (desk: DeskId) => void;
  quit: () => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* no haptics */
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<GameState | null>(null);
  const [v, setV] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [rv, setRv] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0);
  const [report, setReport] = useState<DayReport | null>(null);
  const [toast, setToast] = useState<Ctx['toast']>(null);
  const path = useRef<{ day: number; pts: number[] }>({ day: 0, pts: [] });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') => {
    setToast({ id: Date.now(), text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const hold = useRef<string | null>(null);
  const ticks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const g = JSON.parse(raw) as GameState;
          if (g.version === SAVE_VERSION) ref.current = g;
        }
      } catch {
        /* no save */
      }
      setLoaded(true);
      setV((x) => x + 1);
    })();
  }, []);

  const save = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (ref.current) AsyncStorage.setItem(KEY, JSON.stringify(ref.current)).catch(() => undefined);
      } catch {
        /* storage unavailable */
      }
    }, 300);
  }, []);

  // the market clock: prices tick, news lands and clients call in while it runs
  useEffect(() => {
    if (!speed) return;
    const id = setInterval(() => {
      const g = ref.current;
      if (!g || g.status !== 'playing') return;
      if (g.clock >= CLOSE_MIN) {
        setSpeed(0);
        return;
      }
      const before = g.rfqs.filter((r) => r.status === 'open' && r.arrived).length;
      const news = g.news.length;
      advanceTo(g, g.clock + speed / 2, hold.current);
      if (path.current.day !== g.day) path.current = { day: g.day, pts: [0] };
      path.current.pts.push(totalPnlToday(g));
      if (g.news.length > news) notify(g.news[g.news.length - 1].text, 'bad');
      if (g.clock >= CLOSE_MIN) notify('16:00 — the market is closed. Book the day.', 'neutral');
      // the phone rings or news breaks: drop back to real time so nothing passes you by
      const called = g.rfqs.filter((r) => r.status === 'open' && r.arrived).length > before;
      if (g.news.length > news) haptic('warning');
      else if (called) haptic('light');
      if ((called || g.news.length > news) && speed > 1) setSpeed(1);
      setV((x) => x + 1);
      if (++ticks.current % 20 === 0) save();
    }, 500);
    return () => clearInterval(id);
  }, [speed, save, notify]);

  const bump = useCallback(() => {
    setV((x) => x + 1);
    setRv((x) => x + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (ref.current) AsyncStorage.setItem(KEY, JSON.stringify(ref.current)).catch(() => undefined);
      } catch {
        /* storage unavailable */
      }
    }, 300);
  }, []);

  const api = useMemo<Ctx>(() => {
    const S = () => ref.current!;
    return {
      s: ref.current,
      v,
      rv,
      speed,
      setSpeed,
      holdRfq: (id) => {
        hold.current = id;
      },
      report,
      dismissReport: () => setReport(null),
      toast,
      notify,
      pnlPath: ref.current && path.current.day === ref.current.day ? path.current.pts : [0],
      loaded,
      start: (seed, d) => {
        ref.current = startGame(seed, d);
        setSpeed(0);
        bump();
      },
      quote: (id, q, coupon) => {
        const r = S().rfqs.find((x) => x.id === id);
        if (!r || r.status !== 'open') return null;
        syncMarket(S());
        const res = sendQuote(S(), r, q, { coupon });
        haptic(res.won ? 'success' : 'light');
        bump();
        return res;
      },
      pass: (id) => {
        const r = S().rfqs.find((x) => x.id === id);
        if (r) passRfq(S(), r);
        bump();
      },
      hedge: (desk, idea) => {
        syncMarket(S());
        const c = executeHedge(S(), desk, idea);
        haptic('medium');
        bump();
        return c;
      },
      trade: (desk, instId, qty) => {
        const inst = S().instruments[instId];
        const q = inst && (isFuture(inst) || inst.kind === 'eqOpt') ? Math.round(qty) : qty;
        if (!q) return 0;
        syncMarket(S());
        const c = executeStreet(S(), desk, instId, q, 'hedge');
        haptic('medium');
        bump();
        return c;
      },
      unwind: (desk, instId, frac) => {
        const s = S();
        const p = s.desks[desk].positions[instId];
        if (!p) return 0;
        const inst = s.instruments[instId];
        let q = -p.qty * frac;
        if (isFuture(inst) || inst.kind === 'eqOpt') q = Math.round(q);
        syncMarket(s);
        const c = q ? executeStreet(s, desk, instId, q, 'unwind') : 0;
        bump();
        void unitNotional;
        return c;
      },
      neutralise: (desk) => {
        syncMarket(S());
        const c = autoHedge(S(), desk, 1);
        haptic('medium');
        bump();
        return c;
      },
      close: () => {
        const s = S();
        if (s.status !== 'playing') return null;
        setSpeed(0);
        syncMarket(s);
        const r = closeDay(s);
        setReport(r);
        path.current = { day: s.day, pts: [0] };
        haptic(r.total >= 0 ? 'success' : 'warning');
        bump();
        return r;
      },
      decide: (id, opt) => {
        const out = resolveDecision(S(), id, opt);
        bump();
        return out;
      },
      capital: (desk, amt) => {
        const out = setCapital(S(), desk, amt);
        bump();
        return out;
      },
      deskParam: (desk, patch) => {
        Object.assign(S().desks[desk], patch);
        bump();
      },
      tech: (desk) => {
        const out = upgradeTech(S(), desk);
        bump();
        return out;
      },
      hireT: (t) => {
        const out = hire(S(), t);
        bump();
        return out;
      },
      fireT: (id) => {
        const out = fire(S(), id);
        bump();
        return out;
      },
      launch: (desk) => {
        const s = S();
        if (!s.decisions.some((d) => d.status === 'open' && d.kind === 'launch' && d.data.desk === desk)) launchDecision(s, desk);
        bump();
      },
      quit: () => {
        ref.current = null;
        AsyncStorage.removeItem(KEY).catch(() => undefined);
        setV((x) => x + 1);
      },
    };
  }, [v, rv, speed, loaded, bump, report, toast, notify]);
  if (Platform.OS === 'web' && typeof window !== 'undefined') (window as any).__atlas = api;
  return <GameCtx.Provider value={api}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameProvider missing');
  return c;
}

export { unwindFraction };
