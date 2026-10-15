// "Tap any number" drill-down trees. Engine functions return Calc nodes describing exactly how a
// figure was computed; the UI renders them recursively.

export type CalcFmt = 'money' | 'bps' | 'pct' | 'x' | 'num' | 'days' | 'rate';

export interface Calc {
  label: string;
  value: number;
  fmt?: CalcFmt;
  formula?: string;
  note?: string;
  children?: Calc[];
}

export function calc(label: string, value: number, opts: Partial<Omit<Calc, 'label' | 'value'>> = {}): Calc {
  return { label, value, fmt: 'money', ...opts };
}

export function sumCalc(label: string, children: Calc[], opts: Partial<Omit<Calc, 'label' | 'value' | 'children'>> = {}): Calc {
  return { label, value: children.reduce((a, c) => a + c.value, 0), fmt: 'money', formula: 'Sum of components', ...opts, children };
}
