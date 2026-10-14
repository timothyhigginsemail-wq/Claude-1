import { expect, it } from 'vitest';
import { newGame } from '../src/game/newGame';
import { playDay } from './helpers';
import { mulberry } from './rand';

it('keeps the save file small after 80 days', () => {
  const s = newGame(8);
  const rnd = mulberry(8);
  for (let i = 0; i < 80 && s.status === 'playing'; i++) playDay(s, 'prudent', rnd);
  const kb = JSON.stringify(s).length / 1024;
  expect(kb).toBeLessThan(1500);
});
