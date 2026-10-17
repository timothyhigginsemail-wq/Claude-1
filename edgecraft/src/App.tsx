import { useCallback, useEffect, useState } from 'react';
import type { GameConfig, GameState } from './engine/game';
import { newGame } from './engine/game';
import { Home } from './ui/Home';
import { GameScreen } from './ui/game/GameScreen';
import { clearSave, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from './ui/storage';

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [game, setGame] = useState<GameState | null>(() => loadGame().state);
  const [loadError] = useState<string | undefined>(() => loadGame().error);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    savePrefs(prefs);
  }, [prefs]);

  const updateGame = useCallback((s: GameState) => {
    setGame(s);
    if (!saveGame(s)) console.warn('Could not save game to local storage.');
  }, []);

  const start = (cfg: GameConfig) => {
    updateGame(newGame(cfg));
    setScreen('game');
  };

  const toggleTheme = () => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));

  if (screen === 'game' && game) {
    return <GameScreen state={game} setState={updateGame} prefs={prefs} onExit={() => setScreen('home')} onToggleTheme={toggleTheme} onReplay={start} />;
  }
  return (
    <Home
      saved={game}
      loadError={loadError}
      prefs={prefs}
      onToggleTheme={toggleTheme}
      onContinue={() => setScreen('game')}
      onStart={start}
      onLoad={(s) => {
        updateGame(s);
        setScreen('game');
      }}
      onDiscard={() => {
        clearSave();
        setGame(null);
      }}
    />
  );
}
