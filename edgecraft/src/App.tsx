import { useCallback, useEffect, useState } from 'react';
import type { GameConfig, GameState } from './engine/game';
import { newGame } from './engine/game';
import { Home } from './ui/Home';
import { GameScreen } from './ui/game/GameScreen';
import { Lab } from './lab/Lab';
import { clearSave, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from './ui/storage';

type Screen = { kind: 'home' } | { kind: 'game' } | { kind: 'lab'; exp?: number };

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
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
    const s = newGame(cfg);
    updateGame(s);
    setScreen({ kind: 'game' });
  };

  const toggleTheme = () => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));

  if (screen.kind === 'game' && game) {
    return (
      <GameScreen
        state={game}
        setState={updateGame}
        prefs={prefs}
        setPrefs={setPrefs}
        onExit={() => setScreen({ kind: 'home' })}
        onToggleTheme={toggleTheme}
        onOpenLab={(exp) => setScreen({ kind: 'lab', exp })}
        onReplay={(cfg) => start(cfg)}
      />
    );
  }
  if (screen.kind === 'lab') {
    return <Lab initial={screen.exp} onExit={() => setScreen(game ? { kind: game.status === 'playing' ? 'game' : 'home' } : { kind: 'home' })} onToggleTheme={toggleTheme} theme={prefs.theme} backLabel={game && game.status === 'playing' ? 'Back to campaign' : 'Home'} />;
  }
  return (
    <Home
      saved={game}
      loadError={loadError}
      prefs={prefs}
      onToggleTheme={toggleTheme}
      onContinue={() => setScreen({ kind: 'game' })}
      onStart={start}
      onLoad={(s) => {
        updateGame(s);
        setScreen({ kind: 'game' });
      }}
      onDiscard={() => {
        clearSave();
        setGame(null);
      }}
      onLab={(exp) => setScreen({ kind: 'lab', exp })}
      onOnboarded={() => setPrefs((p) => ({ ...p, onboarded: true }))}
    />
  );
}
