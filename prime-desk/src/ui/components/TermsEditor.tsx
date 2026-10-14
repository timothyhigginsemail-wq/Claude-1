import React from 'react';
import { View } from 'react-native';
import { fm } from '../../engine/format';
import type { ClientTerms } from '../../engine/types';
import { C } from '../theme';
import { Row, Segmented, Stepper, T } from './ui';

type NumKey = 'financingSpreadBps' | 'imMultiplier' | 'maintRatio' | 'maxGrossLeverage' | 'creditLimit' | 'rehypCapPct' | 'lockupDays' | 'concThresholdPct' | 'gcFeeBps' | 'htbMarkupPct' | 'creditSpreadBps';

export const TERM_FIELDS: { key: NumKey; label: string; help: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'financingSpreadBps', label: 'Financing spread', help: 'Charged over SOFR on the debit balance.', min: 20, max: 400, step: 5, fmt: (v) => `S+${Math.round(v)}bp` },
  { key: 'imMultiplier', label: 'House margin multiplier', help: '1.00× = Atlas standard risk model. Lower is more lenient.', min: 0.5, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'maintRatio', label: 'Maintenance / initial', help: 'Call when equity falls below this share of initial margin.', min: 0.6, max: 0.95, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'concThresholdPct', label: 'Concentration threshold', help: 'Single-name size (% of equity) above which a concentration add-on applies.', min: 0.1, max: 0.6, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'maxGrossLeverage', label: 'Max gross leverage', help: 'Gross positions ÷ equity.', min: 1, max: 12, step: 0.5, fmt: (v) => `${v.toFixed(1)}×` },
  { key: 'creditLimit', label: 'Credit limit (max debit)', help: 'Largest margin loan Atlas will extend.', min: 25e6, max: 3e9, step: 25e6, fmt: (v) => fm(v) },
  { key: 'rehypCapPct', label: 'Rehypothecation cap', help: '% of debit Atlas may re-use (US max 140%). Funds like low caps; Atlas loses inventory.', min: 0, max: 1.4, step: 0.1, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'lockupDays', label: 'Margin lock-up', help: 'Days Atlas commits not to tighten margin terms.', min: 0, max: 90, step: 15, fmt: (v) => `${v}d` },
  { key: 'gcFeeBps', label: 'GC borrow fee', help: 'Fee on easy-to-borrow shorts. Client rebate = SOFR − fee.', min: 5, max: 80, step: 5, fmt: (v) => `${Math.round(v)}bp` },
  { key: 'htbMarkupPct', label: 'HTB fee markup', help: 'Markup on the market fee for warm/hard-to-borrow names.', min: 0, max: 0.6, step: 0.05, fmt: (v) => `+${Math.round(v * 100)}%` },
  { key: 'creditSpreadBps', label: 'Credit balance spread', help: 'Paid on free credits: SOFR − spread (floored at 0).', min: 0, max: 150, step: 5, fmt: (v) => `S−${Math.round(v)}bp` },
];

export function TermsEditor({ terms, onChange, compare, compact }: { terms: ClientTerms; onChange: (patch: Partial<ClientTerms>) => void; compare?: Partial<ClientTerms>; compact?: boolean }) {
  const fields = compact ? TERM_FIELDS.filter((f) => !['creditSpreadBps', 'htbMarkupPct'].includes(f.key)) : TERM_FIELDS;
  return (
    <View style={{ gap: 10 }}>
      <View>
        <T v="small" style={{ marginBottom: 6 }}>Margin methodology</T>
        <Segmented value={terms.method} options={[{ id: 'house', label: 'House (portfolio)' }, { id: 'regT', label: 'Reg T-style' }]} onChange={(m) => onChange({ method: m })} />
      </View>
      {fields.map((f) => {
        const v = terms[f.key] as number;
        const ask = compare?.[f.key] as number | undefined;
        return (
          <Row key={f.key} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <T v="small" color={C.text}>{f.label}</T>
              <T v="caption" numberOfLines={2}>{ask !== undefined && Math.abs(ask - v) > 1e-9 ? `Their ask: ${f.fmt(ask)} · ` : ''}{f.help}</T>
            </View>
            <Stepper value={v} min={f.min} max={f.max} step={f.step} format={f.fmt} onChange={(nv) => onChange({ [f.key]: nv } as Partial<ClientTerms>)} />
          </Row>
        );
      })}
    </View>
  );
}
