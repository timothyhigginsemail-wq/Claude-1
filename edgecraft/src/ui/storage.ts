import { deserialize, serialize, type GameState } from '../engine/game';
import type { Level } from '../engine/levels';

const SAVE_KEY = 'edgecraft.save.v3';
const RUNS_KEY = 'edgecraft.runs.v1';
const PREFS_KEY = 'edgecraft.prefs.v1';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function saveGame(s: GameState): boolean {
  return safeSet(SAVE_KEY, serialize(s));
}

export function loadGame(): { state: GameState | null; error?: string } {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return { state: null };
  try {
    return { state: deserialize(raw) };
  } catch (e) {
    return { state: null, error: (e as Error).message };
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export interface RunSummary {
  id: string;
  seed: string;
  level: Level;
  mode: 'campaign' | 'sandbox';
  date: string;
  label: string;
  turns: number;
  finalNav: number;
  navPath: number[];
  decisionScore: number;
  maxDD: number;
  sharpe: number;
  status: string;
}

export function loadRuns(): RunSummary[] {
  const raw = safeGet(RUNS_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveRun(r: RunSummary) {
  const runs = loadRuns().filter((x) => x.id !== r.id);
  runs.unshift(r);
  safeSet(RUNS_KEY, JSON.stringify(runs.slice(0, 60)));
}

export function deleteRun(id: string) {
  safeSet(RUNS_KEY, JSON.stringify(loadRuns().filter((r) => r.id !== id)));
}

export interface Prefs {
  theme: 'dark' | 'light';
  onboarded: boolean;
  showMath: boolean;
}

export function loadPrefs(): Prefs {
  const d: Prefs = { theme: 'dark', onboarded: false, showMath: false };
  const raw = safeGet(PREFS_KEY);
  if (!raw) return d;
  try {
    return { ...d, ...JSON.parse(raw) };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs) {
  safeSet(PREFS_KEY, JSON.stringify(p));
}

export function exportGameFile(s: GameState) {
  const blob = new Blob([serialize(s)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `edgecraft-L${s.config.level}-${s.config.seed}-t${s.turn}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
