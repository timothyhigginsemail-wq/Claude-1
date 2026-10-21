import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SHADOW_INFO, type AllocState, type RoundRecord, type ShadowId } from '../../engine/allocator';
import { AXIS, GRID, Legend, makeTooltip } from '../charts';
import { Bar, Panel } from '../kit';
import { signedPct, toneClass } from '../format';
import { attribute, cumulative } from './attribution';

const COLORS: Record<ShadowId, string> = { noStops: 'var(--c2)', equalRisk: 'var(--c3)', allEqual: 'var(--muted)' };

export function PathChart({ state, height = 220 }: { state: AllocState; height?: number }) {
  const n0 = state.config.nav0;
  const data = state.book.path.map((v, w) => {
    const row: Record<string, number> = { w, you: v / n0 - 1 };
    for (const k of Object.keys(state.shadows) as ShadowId[]) row[k] = (state.shadows[k].path[w] ?? NaN) / n0 - 1;
    return row;
  });
  return (
    <>
      <div style={{ height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="w" {...AXIS} />
            <YAxis {...AXIS} width={48} domain={['auto', 'auto']} tickFormatter={(x) => signedPct(x, 0)} />
            <Tooltip content={makeTooltip((l) => `Week ${l}`, (x) => signedPct(x, 2))} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            {state.rounds.map((r) => <ReferenceLine key={r.round} x={r.fromWeek} stroke="var(--grid)" />)}
            {(Object.keys(SHADOW_INFO) as ShadowId[]).map((k) => (
              <Line key={k} dataKey={k} name={SHADOW_INFO[k].name} stroke={COLORS[k]} strokeWidth={1.6} strokeDasharray={k === 'allEqual' ? '4 3' : undefined} dot={false} isAnimationActive={false} />
            ))}
            <Line dataKey="you" name="You" stroke="var(--c1)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ label: 'You', color: 'var(--c1)' }, ...(Object.keys(SHADOW_INFO) as ShadowId[]).map((k) => ({ label: SHADOW_INFO[k].name, color: COLORS[k], dash: k === 'allEqual' }))]} />
    </>
  );
}

export function CumulativeAttribution({ rounds }: { rounds: RoundRecord[] }) {
  const c = cumulative(rounds);
  const rows: [string, number][] = [['Pool at equal risk', c.base], ['Selection', c.selection], ['Sizing', c.sizing], ['Stops', c.stops]];
  const max = Math.max(0.001, ...rows.map(([, v]) => Math.abs(v)));
  const ex = (x: number) => Math.exp(x) - 1;
  return (
    <div className="space-y-1.5 text-[12px]">
      {rows.map(([l, v]) => (
        <div key={l} className="grid grid-cols-[120px_minmax(0,1fr)_64px] items-center gap-2">
          <span className="text-ink2">{l}</span>
          <Bar value={v} max={max} center tone={v >= 0 ? 'var(--pos-fill)' : 'var(--neg-fill)'} height={8} />
          <span className={`num text-right ${toneClass(v)}`}>{signedPct(ex(v), 1)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[120px_minmax(0,1fr)_64px] items-center gap-2 border-t border-line pt-1.5 font-semibold">
        <span>Total</span><span /><span className={`num text-right ${toneClass(c.total)}`}>{signedPct(ex(c.total), 1)}</span>
      </div>
    </div>
  );
}

export function History({ state, onOpen }: { state: AllocState; onOpen: (r: RoundRecord) => void }) {
  return (
    <Panel title="Track record of your decisions">
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <PathChart state={state} />
        <div>
          <div className="label mb-2">Cumulative: what added value</div>
          <CumulativeAttribution rounds={state.rounds} />
          <div className="label mt-4 mb-1">Rounds</div>
          <div className="flex flex-wrap gap-1.5">
            {state.rounds.map((r) => {
              const a = attribute(r);
              return (
                <button key={r.round} onClick={() => onOpen(r)} className="rounded-md border border-line px-2 py-1 text-left hover:border-muted" title="Open round report">
                  <div className="text-[9.5px] text-muted num">wk {r.fromWeek + 1}–{r.toWeek}</div>
                  <div className={`text-[11px] num ${toneClass(a.you)}`}>{signedPct(a.you, 1)}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}
