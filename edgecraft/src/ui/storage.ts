import { deserializeAlloc, serializeAlloc, type AllocState } from '../engine/allocator';

const SAVE_KEY = 'edgecraft.alloc.v1';
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

export function saveGame(s: AllocState): boolean {
  return safeSet(SAVE_KEY, serializeAlloc(s));
}

export function loadGame(): { state: AllocState | null; error?: string } {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return { state: null };
  try {
    return { state: deserializeAlloc(raw) };
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

export interface Prefs {
  theme: 'dark' | 'light';
}

export function loadPrefs(): Prefs {
  const d: Prefs = { theme: 'dark' };
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
