import React, { createContext, useContext, useMemo, useState } from 'react';

export type Tab = 'desk' | 'clients' | 'book' | 'funding' | 'risk' | 'financials';
export type Route = { name: 'client'; id: string } | { name: 'security'; id: string } | { name: 'ledger' } | { name: 'log' };

interface Nav {
  tab: Tab;
  stack: Route[];
  setTab: (t: Tab) => void;
  push: (r: Route) => void;
  pop: () => void;
  learn: (topic: string) => void;
  topic: string | null;
  closeLearn: () => void;
}

const NavCtx = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>('desk');
  const [stack, setStack] = useState<Route[]>([]);
  const [topic, setTopic] = useState<string | null>(null);
  const api = useMemo<Nav>(
    () => ({
      tab,
      stack,
      setTab: (t) => {
        setTabState(t);
        setStack([]);
      },
      push: (r) => setStack((s) => [...s, r]),
      pop: () => setStack((s) => s.slice(0, -1)),
      learn: (t) => setTopic(t),
      topic,
      closeLearn: () => setTopic(null),
    }),
    [tab, stack, topic],
  );
  return <NavCtx.Provider value={api}>{children}</NavCtx.Provider>;
}

export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavProvider missing');
  return n;
}
