// UI store: owns the GameState, drives the clock, persists saves.

import { useSyncExternalStore } from 'react';
import { GameState, SheetId, newGame, openingMessages, tick, nextDay, Mode } from '../engine/game';
import { challengeById } from '../engine/scenarios';
import { RegimeId } from '../engine/market';

export interface UiState {
  sheet: SheetId | null;
  arg?: string;
  learn?: string;
  labPreset?: string;
  toast?: string;
  screen: 'menu' | 'desk';
}

const SAVE_KEY = (m: Mode) => `convexity.save.${m}`;

class Store {
  g: GameState | null = null;
  ui: UiState = { sheet: null, screen: 'menu' };
  version = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private last = 0;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // ---------------------------------------------------------------- lifecycle
  start(mode: Mode, opts: { seed?: number; regime?: RegimeId; challengeId?: string } = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    if (mode === 'challenge' && opts.challengeId) this.g = challengeById(opts.challengeId).build();
    else this.g = newGame({ mode, seed, regime: opts.regime });
    openingMessages(this.g);
    this.ui = { sheet: null, screen: 'desk' };
    this.ensureLoop();
    this.emit();
  }
  load(mode: Mode): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY(mode));
      if (!raw) return false;
      const g = JSON.parse(raw) as GameState;
      if (!g || g.version !== 1) return false;
      this.g = g;
      this.ui = { sheet: null, screen: 'desk' };
      this.ensureLoop();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }
  hasSave(mode: Mode): { day: number; level: number } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY(mode));
      if (!raw) return null;
      const g = JSON.parse(raw) as GameState;
      return { day: g.market.day + 1, level: g.career.level };
    } catch {
      return null;
    }
  }
  save() {
    if (!this.g || this.g.mode === 'challenge') return;
    try {
      localStorage.setItem(SAVE_KEY(this.g.mode), JSON.stringify(this.g));
    } catch {
      /* storage full or unavailable: the game keeps running */
    }
  }
  exit() {
    this.save();
    this.g = null;
    this.ui = { sheet: null, screen: 'menu' };
    this.emit();
  }

  // ---------------------------------------------------------------- clock
  ensureLoop() {
    if (this.timer) return;
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), 60);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
  }
  paused(): boolean {
    const g = this.g;
    if (!g || g.phase !== 'trading' || this.ui.screen !== 'desk') return true;
    if (g.settings.speed === 0) return true;
    if (g.settings.pauseOnTicket && (this.ui.sheet === 'rfq' || this.ui.sheet === 'lab')) return true;
    return false;
  }
  private loop() {
    const now = performance.now();
    const dt = Math.min(500, now - this.last);
    this.last = now;
    if (this.paused()) {
      this.acc = 0;
      return;
    }
    const g = this.g!;
    const interval = 1000 / g.settings.speed;
    this.acc += dt;
    let n = 0;
    while (this.acc >= interval && n < 3) {
      this.acc -= interval;
      const prevPhase = g.phase;
      tick(g);
      n++;
      if (g.phase !== 'trading') {
        if (prevPhase === 'trading') this.save();
        this.acc = 0;
        break;
      }
      // drop to 1× when something needs attention
      const last = g.feed[g.feed.length - 1];
      if (last && last.day === g.market.day && last.tick === g.market.tick && (last.kind === 'rfq' || last.kind === 'event' || last.tone === 'warn') && g.settings.speed > 1) g.settings.speed = 1;
    }
    if (n) this.emit();
  }

  // ---------------------------------------------------------------- ui
  open(sheet: SheetId | null, arg?: string) {
    this.ui = { ...this.ui, sheet, arg };
    this.emit();
  }
  learn(topic: string) {
    this.ui = { ...this.ui, sheet: 'learn', learn: topic };
    this.emit();
  }
  lab(preset?: string) {
    this.ui = { ...this.ui, sheet: 'lab', labPreset: preset };
    this.emit();
  }
  toast(msg: string) {
    this.ui = { ...this.ui, toast: msg };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.ui = { ...this.ui, toast: undefined };
      this.emit();
    }, 2600);
    this.emit();
  }
  setSpeed(s: number) {
    if (!this.g) return;
    this.g.settings.speed = s;
    this.emit();
  }
  /** Run an engine mutation and re-render. */
  act<T>(fn: (g: GameState) => T): T | undefined {
    if (!this.g) return undefined;
    const r = fn(this.g);
    this.emit();
    return r;
  }
  nextDay() {
    if (!this.g) return;
    nextDay(this.g);
    this.save();
    this.emit();
  }
}

export const store = new Store();

export function useStore(): { g: GameState | null; ui: UiState; v: number } {
  const v = useSyncExternalStore(store.subscribe, store.getVersion);
  return { g: store.g, ui: store.ui, v };
}
