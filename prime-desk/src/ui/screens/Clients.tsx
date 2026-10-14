import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accountValue, notional } from '../../engine/accounts';
import { bestCompetitorQuote, fundSituation } from '../../engine/behavior';
import { calc } from '../../engine/explain';
import { fm, fmSigned, fpct, fx } from '../../engine/format';
import { clientPnlTotal, projectClientAnnual, shortSourcing } from '../../engine/funding';
import { clientFee, rehypCapValue } from '../../engine/lending';
import { computeMargin, liquidityDays, marginCalc } from '../../engine/margin';
import { capitalExplain, clientEconomics, economicProfitExplain, effectivePD, stressClient } from '../../engine/risk';
import type { Client, ClientTerms } from '../../engine/types';
import { lockupRemaining } from '../../game/actions';
import { HBars, Sparkline, Waterfall } from '../components/charts';
import { Screen, useContentWidth } from '../components/Screen';
import { TermsEditor } from '../components/TermsEditor';
import { Bar, Btn, Card, Divider, KV, Metric, Pill, Row, Section, Segmented, T, useExplain } from '../components/ui';
import { useGame } from '../GameContext';
import { useNav } from '../nav';
import { C, S, signColor } from '../theme';

function statusPill(s: ReturnType<typeof useGame>['s'], c: Client) {
  if (!s) return null;
  if (c.status !== 'active') return <Pill text={c.status} color={c.status === 'defaulted' ? C.down : C.textFaint} />;
  const m = computeMargin(s, c);
  if (c.marginCall?.status === 'open') return <Pill text="Call open" color={C.down} filled />;
  if (m.equity < m.maintenance) return <Pill text="Deficit" color={C.down} filled />;
  if (m.excess < 0) return <Pill text="Below initial" color={C.warn} />;
  return <Pill text="Margin OK" color={C.up} />;
}

export function ClientsScreen() {
  const g = useGame();
  const s = g.s!;
  const nav = useNav();
  const w = useContentWidth();
  const active = Object.values(s.clients).filter((c) => c.status === 'active');
  const econ = useMemo(() => Object.fromEntries(active.map((c) => [c.id, clientEconomics(s, c)])), [g.v]);
  const sorted = [...active].sort((a, b) => econ[b.id].economicProfit - econ[a.id].economicProfit);
  const prospects = Object.values(s.clients).filter((c) => c.status === 'prospect' && c.arrivalDay <= s.day + 30);
  const former = Object.values(s.clients).filter((c) => ['exited', 'defaulted', 'declined'].includes(c.status));
  return (
    <Screen title="Clients" subtitle={`${active.length} active · ${prospects.length} in pipeline`}>
      {active.length ? (
        <Section title="Who creates value (economic profit, annual run-rate)">
          <Card>
            <HBars width={w - 2 * S.lg} rows={sorted.map((c) => ({ label: c.short, value: econ[c.id].economicProfit, sub: `RoAC ${fpct(econ[c.id].roac, 0)}` }))} />
            <T v="caption" style={{ marginTop: 10 }}>Economic profit = revenue after funding (FTP) − expected loss − 12% cost of the capital each client consumes. Tap a client to see why.</T>
          </Card>
        </Section>
      ) : (
        <Card style={{ marginTop: S.md }}>
          <T v="small">No clients yet. New mandates arrive on the Desk.</T>
        </Card>
      )}
      <Section title="Active">
        <View style={{ gap: 10 }}>
          {sorted.map((c) => {
            const av = accountValue(s, c);
            const e = econ[c.id];
            return (
              <Card key={c.id} onPress={() => nav.push({ name: 'client', id: c.id })} accent={c.color}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T v="h3">{c.name}</T>
                    <T v="caption">{c.profile.strategy} · {c.profile.rating}</T>
                  </View>
                  {statusPill(s, c)}
                </Row>
                <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                  <Col k="Equity" v={fm(av.equity)} />
                  <Col k="Gross" v={fm(av.gmv + av.futGross)} />
                  <Col k="Leverage" v={fx(av.leverage)} />
                  <Col k="EP" v={fm(e.economicProfit)} tone={signColor(e.economicProfit)} />
                </Row>
                <Row gap={8} style={{ marginTop: 10 }}>
                  <T v="caption" style={{ width: 70 }}>Relationship</T>
                  <View style={{ flex: 1 }}>
                    <Bar value={c.relationship} max={100} color={c.relationship < 35 ? C.down : c.relationship < 55 ? C.warn : C.up} height={4} />
                  </View>
                  <T v="caption" color={c.satisfaction < -0.15 ? C.down : c.satisfaction > 0.15 ? C.up : C.textDim}>{c.satisfaction < -0.15 ? 'unhappy' : c.satisfaction > 0.15 ? 'happy' : 'neutral'}</T>
                </Row>
              </Card>
            );
          })}
        </View>
      </Section>
      {prospects.length ? (
        <Section title="Pipeline">
          <Card style={{ gap: 8 }}>
            {prospects.map((c) => (
              <Row key={c.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={C.text}>{c.name}</T>
                  <T v="caption">{c.profile.strategy} · NAV {fm(c.fund.nav)}</T>
                </View>
                <T v="caption">{c.arrivalDay <= s.day ? 'talking now' : `approaches day ${c.arrivalDay}`}</T>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
      {former.length ? (
        <Section title="Former & declined">
          <Card style={{ gap: 8 }}>
            {former.map((c) => (
              <Row key={c.id} style={{ justifyContent: 'space-between' }}>
                <T v="small" color={C.text} style={{ flex: 1 }}>{c.name}</T>
                <Row gap={6}>
                  {c.claim ? <T v="caption" color={C.warn}>claim {fm(c.claim.amount)}</T> : null}
                  {Math.abs(clientPnlTotal(c.pnl)) > 1 ? <T v="caption" color={signColor(clientPnlTotal(c.pnl))}>{fmSigned(clientPnlTotal(c.pnl))}</T> : null}
                  <Pill text={c.status} color={c.status === 'defaulted' ? C.down : C.textFaint} />
                </Row>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function Col({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <View>
      <T v="caption">{k}</T>
      <T v="num" color={tone}>{v}</T>
    </View>
  );
}

type Tab = 'overview' | 'positions' | 'economics' | 'terms' | 'risk';

export function ClientDetail({ id }: { id: string }) {
  const g = useGame();
  const s = g.s!;
  const c = s.clients[id];
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <Screen back title={c.name} subtitle={`${c.profile.strategy} · ${c.status}`} right={statusPill(s, c)}>
      <View style={{ marginTop: S.md }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'overview', label: 'Account' },
            { id: 'positions', label: 'Book' },
            { id: 'economics', label: 'P&L' },
            { id: 'terms', label: 'Terms' },
            { id: 'risk', label: 'Risk' },
          ]}
        />
      </View>
      {tab === 'overview' ? <Overview c={c} /> : null}
      {tab === 'positions' ? <Positions c={c} /> : null}
      {tab === 'economics' ? <Economics c={c} /> : null}
      {tab === 'terms' ? <Terms c={c} /> : null}
      {tab === 'risk' ? <Risk c={c} /> : null}
    </Screen>
  );
}

function Overview({ c }: { c: Client }) {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  const { open } = useExplain();
  const av = accountValue(s, c);
  const m = computeMargin(s, c);
  const cap = rehypCapValue(s, c);
  let rehypUsed = 0;
  for (const id in s.alloc.rehypForShorts[c.id] ?? {}) rehypUsed += s.alloc.rehypForShorts[c.id][id] * s.securities[id].price;
  let rehypRepo = 0;
  for (const id in s.alloc.rehypForRepo[c.id] ?? {}) rehypRepo += s.alloc.rehypForRepo[c.id][id] * s.securities[id].price;
  const sit = fundSituation(s, c);
  const log = s.log.filter((l) => l.text.includes(c.short) || l.text.includes(c.name)).slice(-8).reverse();
  const equityCalc = () =>
    calc('Equity in the Atlas account', av.equity, {
      formula: 'cash balance + short-account credit + long MV − short MV',
      note: 'Short-account credits are marked to the short market value daily, so equity = cash + long MV. A negative cash balance is the margin loan.',
      children: [
        calc('Cash balance (− = margin loan / debit)', av.cash),
        calc('Short-sale proceeds (short account)', av.shortProceeds),
        calc('Long market value (customer property, in custody)', av.longMV),
        calc('Short market value (obligation to return borrowed shares)', -av.shortMV),
      ],
    });
  if (c.status !== 'active') {
    return (
      <Card style={{ marginTop: S.md }}>
        <T v="small">{c.status === 'prospect' ? c.pitch : `Relationship ended on day ${c.closedDay ?? '—'}.`}</T>
        {c.claim ? <KV k="Outstanding claim on the estate" v={fm(c.claim.amount)} sub={`expected recovery ~${fpct(c.claim.expectedRecovery, 0)} around day ${c.claim.resolveDay}`} /> : null}
        <KV k="Lifetime contribution" v={fmSigned(clientPnlTotal(c.pnl))} tone={signColor(clientPnlTotal(c.pnl))} />
      </Card>
    );
  }
  return (
    <View>
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Equity at Atlas" value={fm(av.equity)} calc={equityCalc} />
        <Metric label="Excess margin" value={fm(m.excess)} tone={m.excess < 0 ? C.down : C.up} calc={() => marginCalc(s, c)} sub={`IM ${fm(m.initial)} · MM ${fm(m.maintenance)}`} />
      </Row>
      <Card style={{ marginTop: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="label">Equity vs margin</T>
          <T v="caption">{m.method === 'house' ? 'House model' : 'Reg T-style'}</T>
        </Row>
        <View style={{ marginTop: 8 }}>
          <Bar value={Math.max(0, av.equity)} max={Math.max(av.equity, m.initial) * 1.15} color={av.equity < m.maintenance ? C.down : av.equity < m.initial ? C.warn : C.up} height={10} marker={m.maintenance} />
        </View>
        <T v="caption" style={{ marginTop: 6 }}>White marker = maintenance. Below it, Atlas calls margin.</T>
        {c.equityHist.length > 2 ? (
          <View style={{ marginTop: 10 }}>
            <Sparkline data={c.equityHist.slice(-60)} width={w - 2 * S.lg} height={50} color={c.color} />
          </View>
        ) : null}
      </Card>
      <Section title="Account at Atlas">
        <Card>
          <KV k="Long market value" v={fm(av.longMV)} />
          <KV k="Short market value" v={fm(av.shortMV)} />
          {av.futGross ? <KV k="Futures notional (gross)" v={fm(av.futGross)} /> : null}
          <KV k={av.cash < 0 ? 'Margin loan (debit balance)' : 'Free credit balance'} v={fm(Math.abs(av.cash))} tone={av.cash < 0 ? C.warn : C.up} />
          <KV k="Short-sale proceeds (restricted)" v={fm(av.shortProceeds)} />
          <KV k="Gross leverage" v={fx(av.leverage)} sub={`limit ${fx(c.terms.maxGrossLeverage)}`} />
          <KV k="Credit limit used" v={fpct(av.debit / Math.max(1, c.terms.creditLimit), 0)} sub={`${fm(av.debit)} of ${fm(c.terms.creditLimit)}`} />
          <Divider />
          <KV
            k="Rehypothecation capacity"
            v={fm(cap)}
            sub={`${fm(rehypUsed)} lent to other clients' shorts · ${fm(rehypRepo)} available as repo collateral`}
            onPress={() =>
              open(
                calc('Rehypothecation capacity', cap, {
                  formula: `${Math.round(c.terms.rehypCapPct * 100)}% × debit balance ${fm(av.debit)} (US limit 140%)`,
                  note: 'Margin securities above this amount are "excess margin securities" and must be segregated. Fully-paid securities can never be re-used.',
                  children: [calc('Used to cover other clients\' shorts (internalisation)', rehypUsed), calc('Allocated as repo collateral', rehypRepo), calc('Long securities segregated (not re-usable)', Math.max(0, av.longMV - rehypUsed - rehypRepo))],
                }),
              )
            }
          />
        </Card>
      </Section>
      <Section title="The fund (all prime brokers)">
        <Card>
          <KV k="Fund NAV" v={fm(c.fund.nav)} sub={`peak ${fm(c.fund.peakNav)} · drawdown ${fpct(1 - c.fund.nav / c.fund.peakNav)}`} onPress={() => open(sit.explain)} />
          <KV k="Unencumbered cash" v={fm(c.fund.freeCash)} />
          <KV k="Atlas wallet share" v={fpct(c.walletShare, 1)} />
          <KV k="Other prime brokers" v={c.fund.otherPBs.map((o) => s.competitors[o.competitorId].name).join(', ')} />
          {c.fund.redemptionsPending > 0 ? <KV k="Pending redemptions" v={fm(c.fund.redemptionsPending)} tone={C.down} /> : null}
          <Divider />
          <Row gap={8}>
            <T v="small" style={{ width: 90 }}>Relationship</T>
            <View style={{ flex: 1 }}>
              <Bar value={c.relationship} max={100} color={C.accent} />
            </View>
            <T v="num">{Math.round(c.relationship)}</T>
          </Row>
        </Card>
      </Section>
      {log.length ? (
        <Section title="History with Atlas">
          <Card style={{ gap: 6 }}>
            {log.map((l, i) => (
              <T key={i} v="caption" color={l.tone === 'bad' ? C.down : l.tone === 'good' ? C.up : C.textDim}>Day {l.day}: {l.text}</T>
            ))}
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

function Positions({ c }: { c: Client }) {
  const g = useGame();
  const s = g.s!;
  const nav = useNav();
  const av = accountValue(s, c);
  const src = Object.fromEntries(shortSourcing(s, c).map((r) => [r.secId, r]));
  const rows = Object.entries(c.positions)
    .map(([id, q]) => ({ id, q, mv: notional(s.securities[id], q) }))
    .sort((a, b) => Math.abs(b.mv) - Math.abs(a.mv));
  return (
    <View style={{ marginTop: S.md, gap: 8 }}>
      <T v="caption">Customer positions are custodied by Atlas but belong to the fund. Tap a security for borrow supply and sourcing.</T>
      {rows.map((r) => {
        const sec = s.securities[r.id];
        const ld = liquidityDays(s, r.id, r.mv);
        const so = src[r.id];
        const lent = (s.alloc.rehypForShorts[c.id]?.[r.id] ?? 0) * sec.price;
        const repo = (s.alloc.rehypForRepo[c.id]?.[r.id] ?? 0) * sec.price;
        return (
          <Card key={r.id} onPress={() => nav.push({ name: 'security', id: r.id })} style={{ padding: S.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={8}>
                <T v="h3">{r.id}</T>
                <Pill text={r.q > 0 ? 'Long' : 'Short'} color={r.q > 0 ? C.up : C.down} />
              </Row>
              <T v="num" color={r.q > 0 ? C.text : C.down}>{fm(r.mv)}</T>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <T v="caption">{sec.name}</T>
              <T v="caption">{fpct(Math.abs(r.mv) / Math.max(1, av.equity), 0)} of equity · {ld.toFixed(1)}d ADV</T>
            </Row>
            {r.q < 0 && sec.kind !== 'future' ? (
              <T v="caption" style={{ marginTop: 4 }} color={C.textDim}>
                Fee {clientFee(s, c, r.id)}bp (mkt {sec.borrowFeeBps}bp) · {so ? `${fm(so.internalUnits * sec.price)} internal / ${fm(so.externalUnits * sec.price)} external` : ''}
              </T>
            ) : null}
            {r.q > 0 && (lent > 0 || repo > 0) ? (
              <T v="caption" style={{ marginTop: 4 }} color={C.info}>Rehypothecated: {fm(lent)} lent to shorts · {fm(repo)} repo collateral</T>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const PNL_ROWS: [keyof ReturnType<typeof projectClientAnnual>, string][] = [
  ['financing', 'Margin financing interest'],
  ['creditInterest', 'Interest on credits'],
  ['shortRebate', 'Short rebates'],
  ['lenderRebate', 'Lender collateral rebates'],
  ['internalLending', 'Internal stock-loan transfer'],
  ['ftp', 'Funding charge (FTP)'],
  ['collateralCredit', 'Repo collateral credit'],
  ['clearing', 'Clearing & settlement'],
  ['servicing', 'Servicing cost'],
];

function Economics({ c }: { c: Client }) {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  if (c.status !== 'active') return <Card style={{ marginTop: S.md }}><T v="small">Lifetime contribution {fmSigned(clientPnlTotal(c.pnl))}.</T></Card>;
  const p = projectClientAnnual(s, c);
  const e = clientEconomics(s, c);
  return (
    <View>
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Economic profit" value={fm(e.economicProfit)} tone={signColor(e.economicProfit)} calc={() => economicProfitExplain(s, c)} sub="annual run-rate" />
        <Metric label="Return on capital" value={fpct(e.roac)} tone={e.roac > 0.12 ? C.up : e.roac > 0 ? C.warn : C.down} calc={() => capitalExplain(s, c)} sub={`${fm(e.capital)} ${e.binding === 'CCR' ? 'credit' : 'leverage'}-bound`} />
      </Row>
      <Section title="Revenue build (annual run-rate)">
        <Card>
          <Waterfall width={w - 2 * S.lg} items={PNL_ROWS.map(([k, l]) => ({ label: l, value: p[k] as number }))} total={p.total} totalLabel="Net revenue" />
          <Divider />
          <KV k="Expected credit loss (PD × LGD × stress exposure)" v={fm(-e.expectedLoss)} tone={C.down} />
          <KV k="Cost of capital (12%)" v={fm(-e.costOfCapital)} tone={C.down} />
          <KV k="Economic profit" v={fm(e.economicProfit)} tone={signColor(e.economicProfit)} />
          <T v="caption" style={{ marginTop: 8 }}>
            Net funding use {fm(p.netUse)} ({p.netUse < 0 ? 'a funding provider — earns an FTP credit' : 'charged at FTP'}). Internal transfer credits clients whose rehypothecated shares cover other clients' shorts, and charges the users.
          </T>
        </Card>
      </Section>
      <Section title="Since onboarding (booked)">
        <Card>
          {PNL_ROWS.map(([k, l]) => (Math.abs((c.pnl as any)[k] ?? 0) > 1 ? <KV key={k} k={l} v={fmSigned((c.pnl as any)[k])} tone={signColor((c.pnl as any)[k])} /> : null))}
          {Math.abs(c.pnl.creditLoss) > 1 ? <KV k="Credit losses / recoveries" v={fmSigned(c.pnl.creditLoss)} tone={signColor(c.pnl.creditLoss)} /> : null}
          <Divider />
          <KV k="Total contribution" v={fmSigned(clientPnlTotal(c.pnl))} tone={signColor(clientPnlTotal(c.pnl))} />
        </Card>
      </Section>
    </View>
  );
}

function Terms({ c }: { c: Client }) {
  const g = useGame();
  const s = g.s!;
  const [draft, setDraft] = useState<ClientTerms>({ ...c.terms });
  const [msg, setMsg] = useState<string | null>(null);
  if (c.status !== 'active') return <Card style={{ marginTop: S.md }}><T v="small">No live terms.</T></Card>;
  const lock = lockupRemaining(s, c.id);
  const best = bestCompetitorQuote(s, c);
  const dirty = JSON.stringify(draft) !== JSON.stringify(c.terms);
  return (
    <View style={{ marginTop: S.md }}>
      <Card>
        <Row gap={8} style={{ alignItems: 'flex-start' }}>
          <Ionicons name={lock > 0 ? 'lock-closed-outline' : 'lock-open-outline'} size={16} color={lock > 0 ? C.warn : C.textDim} />
          <T v="small" style={{ flex: 1 }}>
            {lock > 0 ? `Margin lock-up: ${lock} day${lock === 1 ? '' : 's'} left. You can loosen terms or reprice, but not tighten margin unless the account is in deficit.` : 'No lock-up in force: you may tighten margin terms (the client will notice).'} Best competing quote: {s.competitors[best.competitorId].name} at SOFR+{best.spread}bp, {best.marginMult.toFixed(2)}× margin.
          </T>
        </Row>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <TermsEditor terms={draft} onChange={(p) => setDraft({ ...draft, ...p })} />
      </Card>
      {msg ? (
        <Card style={{ marginTop: 10 }} accent={C.accent}>
          <T v="small" color={C.text}>{msg}</T>
        </Card>
      ) : null}
      <Row gap={10} style={{ marginTop: S.md }}>
        <Btn title="Reset" tone="ghost" style={{ flex: 1 }} disabled={!dirty} onPress={() => setDraft({ ...c.terms })} />
        <Btn
          title="Apply new terms"
          tone="primary"
          style={{ flex: 2 }}
          disabled={!dirty}
          onPress={() => {
            const patch: Partial<ClientTerms> = {};
            for (const k of Object.keys(draft) as (keyof ClientTerms)[]) if (JSON.stringify(draft[k]) !== JSON.stringify(c.terms[k])) (patch as any)[k] = draft[k];
            const r = g.terms(c.id, patch);
            setMsg(r.message);
            if (!r.ok) setDraft({ ...c.terms });
            else setDraft({ ...g.s!.clients[c.id].terms });
          }}
        />
      </Row>
    </View>
  );
}

function Risk({ c }: { c: Client }) {
  const g = useGame();
  const s = g.s!;
  const { open } = useExplain();
  if (c.status !== 'active') return <Card style={{ marginTop: S.md }}><T v="small">No live exposure.</T></Card>;
  const st = stressClient(s, c);
  const e = clientEconomics(s, c);
  const sit = fundSituation(s, c);
  const av = accountValue(s, c);
  return (
    <View>
      <Row gap={10} style={{ marginTop: S.md }}>
        <Metric label="Stress exposure" value={fm(e.exposure)} tone={e.exposure > 0 ? C.down : C.up} sub="Atlas shortfall, worst scenario" />
        <Metric label="PD (annual)" value={fpct(effectivePD(s, c), 1)} sub={`${c.profile.rating} · EL ${fm(e.expectedLoss)}`} />
      </Row>
      <Section title="Stress scenarios">
        <Card>
          {st.map((r) => (
            <View key={r.id} style={{ paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" color={C.text} style={{ flex: 1 }}>{r.name}</T>
                <T v="num" color={r.shortfall > 0 ? C.down : C.textDim}>{r.shortfall > 0 ? `Atlas −${fm(r.shortfall)}` : 'covered'}</T>
              </Row>
              <T v="caption">Client P&L {fm(r.pnl)} · liquidation cost {fm(r.liquidationCost)} · equity {fm(av.equity)}</T>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Control vs claims">
        <Card onPress={() => open(sit.explain)}>
          <T v="small" color={C.text}>If {c.short} defaults, Atlas can immediately liquidate only what is in its account ({fm(av.equity)} of equity). The rest of the fund's {fm(c.fund.nav)} NAV is pledged to its other prime brokers; any shortfall becomes an unsecured legal claim on the estate.</T>
          <Row gap={4} style={{ marginTop: 8 }}>
            <T v="caption" color={C.accent}>See the breakdown</T>
            <Ionicons name="chevron-forward" size={12} color={C.accent} />
          </Row>
        </Card>
      </Section>
    </View>
  );
}
