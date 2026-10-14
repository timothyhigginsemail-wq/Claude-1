import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../engine/types';
import { SAVE_VERSION } from '../game/newGame';

const KEY = 'atlas-prime-save-v' + SAVE_VERSION;

export async function loadGame(): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}

export async function saveGame(s: GameState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable: the game keeps running in memory
  }
}

export async function clearSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
