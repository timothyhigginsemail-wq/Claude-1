import { useStore } from './store';
import { Desk } from './Desk';
import { Menu } from './Menu';

export function App() {
  const { ui, g } = useStore();
  if (ui.screen === 'menu' || !g) return <Menu />;
  return <Desk />;
}
