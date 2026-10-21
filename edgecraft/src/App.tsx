import { useCallback, useEffect, useState } from 'react';
import { newAllocGame, type AllocConfig, type AllocState } from './engine/allocator';
import { Home, randomSeed } from './ui/Home';
import { AllocScreen } from './ui/alloc/AllocScreen';
import { clearSave, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from './ui/storage';

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [game, setGame] = useState<AllocState | null>(() => loadGame().state);
  const [loadError] = useState<string | undefined>(() => loadGame().error);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    savePrefs(prefs);
  }, [prefs]);

  const update = useCallback((s: AllocState) => {
    setGame(s);
    if (!saveGame(s)) console.warn('Could not save to local storage.');
  }, []);

  const start = (cfg: AllocConfig) => {
    update(newAllocGame(cfg));
    setScreen('game');
  };

  const toggleTheme = () => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));

  if (screen === 'game' && game) {
    return (
      <AllocScreen
        state={game}
        setState={update}
        onExit={() => setScreen('home')}
        onToggleTheme={toggleTheme}
        theme={prefs.theme}
        onNew={(seed) => start({ ...game.config, seed: seed ?? randomSeed() })}
      />
    );
  }
  return (
    <Home
      saved={game}
      loadError={loadError}
      prefs={prefs}
      onToggleTheme={toggleTheme}
      onContinue={() => setScreen('game')}
      onStart={start}
      onDiscard={() => {
        clearSave();
        setGame(null);
      }}
    />
  );
}
