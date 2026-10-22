// The people on the floor.

export type NpcId = 'margot' | 'priya' | 'tomas' | 'dmitri' | 'wen' | 'jules' | 'theo' | 'desk';

export interface Npc {
  id: NpcId;
  name: string;
  role: string;
  initials: string;
  hue: number; // avatar colour
  voice: string;
}

export const NPCS: Record<NpcId, Npc> = {
  margot: { id: 'margot', name: 'Margot Reyes', role: 'Head of Cross-Asset Exotics', initials: 'MR', hue: 18, voice: 'Dry, exacting, rarely raises her voice. Ran the autocall book through two crises.' },
  priya: { id: 'priya', name: 'Priya Anand', role: 'Equity Derivatives Sales', initials: 'PA', hue: 330, voice: 'Relentless, warm with clients, impatient with traders who hide.' },
  tomas: { id: 'tomas', name: 'Tomás Lindqvist', role: 'Structurer', initials: 'TL', hue: 270, voice: 'Loves an elegant payoff. Less interested in who hedges it.' },
  dmitri: { id: 'dmitri', name: 'Dmitri Volkov', role: 'Market Risk', initials: 'DV', hue: 200, voice: 'Precise. Polite. Will flatten your book if you make him.' },
  wen: { id: 'wen', name: 'Wen Okafor', role: 'Quant, Exotics Modelling', initials: 'WO', hue: 160, voice: 'Careful, curious, always states the assumption first.' },
  jules: { id: 'jules', name: 'Jules Hartmann', role: 'Cross-Asset Strategist', initials: 'JH', hue: 48, voice: 'Talks in regimes and probabilities.' },
  theo: { id: 'theo', name: 'Theo Park', role: 'Flow Vol Trader', initials: 'TP', hue: 95, voice: 'Competitive, quick, happy to trade with you when it suits his book.' },
  desk: { id: 'desk', name: 'Desk', role: 'System', initials: '◆', hue: 70, voice: '' },
};
