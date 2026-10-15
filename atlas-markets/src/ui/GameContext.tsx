import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { executeStreet, unitNotional } from '../engine/book';
import { isFuture } from '../engine/pricing';
import type { DayReport, DeskId, GameState, Trader } from '../engine/types';
import { closeDay, startGame, unwindFraction } from '../game/day';
import { autoHedge } from '../game/flow';
import { fire, hire, launchDecision, resolveDecision, setCapital, upgradeTech } from '../game/manage';
import { executeHedge, passRfq, sendQuote, type HedgeIdea, type QuoteResult } from '../game/rfq';
import { SAVE_VERSION } from '../game/setup';

const KEY = 'atlas-markets-save-v' + SAVE_VERSION;

interface Ctx {
  s: GameState | null;
  v: number;
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

  const bump = useCallback(() => {
    setV((x) => x + 1);
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
      loaded,
      start: (seed, d) => {
        ref.current = startGame(seed, d);
        bump();
      },
      quote: (id, q, coupon) => {
        const r = S().rfqs.find((x) => x.id === id);
        if (!r || r.status !== 'open') return null;
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
        const c = executeHedge(S(), desk, idea);
        haptic('medium');
        bump();
        return c;
      },
      trade: (desk, instId, qty) => {
        const inst = S().instruments[instId];
        const q = inst && (isFuture(inst) || inst.kind === 'eqOpt') ? Math.round(qty) : qty;
        if (!q) return 0;
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
        const c = q ? executeStreet(s, desk, instId, q, 'unwind') : 0;
        bump();
        void unitNotional;
        return c;
      },
      neutralise: (desk) => {
        const c = autoHedge(S(), desk, 1);
        haptic('medium');
        bump();
        return c;
      },
      close: () => {
        const s = S();
        if (s.status !== 'playing') return null;
        const r = closeDay(s);
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
  }, [v, loaded, bump]);
  if (Platform.OS === 'web' && typeof window !== 'undefined') (window as any).__atlas = api;
  return <GameCtx.Provider value={api}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameProvider missing');
  return c;
}

export { unwindFraction };
