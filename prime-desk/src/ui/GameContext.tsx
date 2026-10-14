import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { ClientTerms, DayReport, DeskPolicy, Difficulty, GameState } from '../engine/types';
import { endDay } from '../game/day';
import { previewOption, resolveEvent, type PreviewResult } from '../game/events';
import { newGame } from '../game/newGame';
import { changeTerms, clearNameAddon, lockTermRepo, setDeskMargin, setPolicy, type TermsChangeResult } from '../game/actions';
import { clearSave, loadGame, saveGame } from './storage';

interface Ctx {
  s: GameState | null;
  v: number;
  loaded: boolean;
  start: (seed: number, d: Difficulty) => void;
  resolve: (evId: string, optionId: string, param?: number) => string;
  preview: (evId: string, optionId: string, param?: number) => PreviewResult | null;
  editProposal: (evId: string, patch: Partial<ClientTerms>) => void;
  closeDay: () => DayReport | null;
  terms: (clientId: string, patch: Partial<ClientTerms>) => TermsChangeResult;
  policy: (patch: Partial<DeskPolicy>) => string;
  deskMargin: (patch: { houseMarketShock?: number; concAddonRate?: number }) => string;
  termRepo: (amount: number) => string;
  removeAddon: (secId: string) => string;
  seeTopic: (k: string) => void;
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadGame().then((g) => {
      ref.current = g;
      setLoaded(true);
      setV((x) => x + 1);
    });
  }, []);

  const bump = useCallback(() => {
    setV((x) => x + 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (ref.current) saveGame(ref.current);
    }, 250);
  }, []);

  const api = useMemo<Ctx>(
    () => ({
      s: ref.current,
      v,
      loaded,
      start: (seed, d) => {
        ref.current = newGame(seed, d);
        bump();
      },
      resolve: (evId, optionId, param) => {
        const s = ref.current!;
        const ev = s.events.find((e) => e.id === evId);
        if (!ev) return '';
        const out = resolveEvent(s, ev, optionId, param);
        haptic('medium');
        bump();
        return out;
      },
      preview: (evId, optionId, param) => (ref.current ? previewOption(ref.current, evId, optionId, param) : null),
      editProposal: (evId, patch) => {
        const ev = ref.current?.events.find((e) => e.id === evId);
        if (!ev) return;
        ev.data.proposal = { ...ev.data.proposal, ...patch };
        bump();
      },
      closeDay: () => {
        const s = ref.current;
        if (!s || s.status !== 'playing') return null;
        const r = endDay(s);
        haptic(r.netIncome >= 0 ? 'success' : 'warning');
        bump();
        return r;
      },
      terms: (clientId, patch) => {
        const r = changeTerms(ref.current!, clientId, patch);
        bump();
        return r;
      },
      policy: (patch) => {
        const r = setPolicy(ref.current!, patch);
        bump();
        return r;
      },
      deskMargin: (patch) => {
        const r = setDeskMargin(ref.current!, patch);
        bump();
        return r;
      },
      termRepo: (amount) => {
        const r = lockTermRepo(ref.current!, amount);
        bump();
        return r;
      },
      removeAddon: (secId) => {
        const r = clearNameAddon(ref.current!, secId);
        bump();
        return r;
      },
      seeTopic: (k) => {
        const s = ref.current;
        if (s && !s.seenTopics.includes(k)) {
          s.seenTopics.push(k);
          bump();
        }
      },
      quit: () => {
        ref.current = null;
        clearSave();
        setV((x) => x + 1);
      },
    }),
    [v, loaded, bump],
  );
  return <GameCtx.Provider value={api}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameProvider missing');
  return c;
}

/** The active game state (only call inside screens rendered when a game exists). */
export function useS(): GameState {
  const { s } = useGame();
  if (!s) throw new Error('No game');
  return s;
}
