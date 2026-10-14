import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { deskSummary, fundingSourcesExplain, projectFundingAnnual } from '../../engine/analytics';
import { fm, fpct, fx } from '../../engine/format';
import { ftpRate, liquidityMetrics, repoRate, reserveCalc, reserveExplain, termRepoTotal } from '../../engine/funding';
import { balanceSheet } from '../../engine/ledger';
import { Sparkline, TwinStack } from '../components/charts';
import { Screen, useContentWidth } from '../components/Screen';
import { Bar, Btn, Card, KV, Metric, Row, Section, Segmented, Stepper, T, useExplain } from '../components/ui';
import { useGame } from '../GameContext';
import { C, S } from '../theme';

export function FundingScreen() {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  const { open } = useExplain();
  const bs = useMemo(() => balanceSheet(s), [g.v]);
  const d = useMemo(() => deskSummary(s), [g.v]);
  const lm = useMemo(() => liquidityMetrics(s), [g.v]);
  const rc = useMemo(() => reserveCalc(s), [g.v]);
  const fund = useMemo(() => projectFundingAnnual(s), [g.v]);
  const [termAmt, setTermAmt] = useState(100e6);
  const [msg, setMsg] = useState<string | null>(null);
  const pol = s.desk.policy;
  const wholesale = bs.liabilities.repo + bs.liabilities.termRepo + bs.liabilities.treasury + bs.liabilities.emergency;
  const blended = wholesale > 0 ? -fund.total / wholesale : 0;
  const hist = s.history.slice(-40);

  return (
    <Screen title="Funding" subtitle="Treasury, repo, customer reserve and liquidity">
      <Section title="Where the money comes from and goes" right={<T v="caption" color={C.accent}>tap for detail</T>}>
        <Card onPress={() => open(fundingSourcesExplain(s))}>
          <TwinStack
            width={w - 2 * S.lg}
            leftTitle="Uses"
            rightTitle="Sources"
            left={[
              { label: 'Margin loans', value: bs.assets.marginLoans, color: '#C9A86A' },
              { label: 'Lender collateral', value: bs.assets.stockBorrowCollateral, color: '#6FA3D9' },
              { label: 'Reserve a/c', value: bs.assets.reserve, color: '#9C8FD9' },
              { label: 'CCP margin', value: bs.assets.ccpMargin, color: '#D9789C' },
              { label: 'Cash buffer', value: bs.assets.cash, color: '#4CBF8C' },
            ]}
            right={[
              { label: 'Client credits', value: bs.liabilities.freeCredits, color: '#8FB3A0' },
              { label: 'Short proceeds', value: bs.liabilities.shortProceeds, color: '#80B9D9' },
              { label: 'Repo', value: bs.liabilities.repo + bs.liabilities.termRepo, color: '#E0A96D' },
              { label: 'Treasury', value: bs.liabilities.treasury, color: '#B39DDB' },
              { label: 'Emergency', value: bs.liabilities.emergency, color: '#E36B62' },
              { label: 'Desk equity', value: bs.equity.total, color: '#A3B86C' },
            ]}
          />
          <T v="caption" style={{ marginTop: 10 }}>Customer securities are off balance sheet. Customer cash (credits, short proceeds) can fund customer debits only; the reserve account absorbs any excess.</T>
        </Card>
      </Section>

      <Row gap={10} style={{ marginTop: 10 }}>
        <Metric label="Wholesale funding" value={fm(wholesale)} sub={`blended ${fpct(blended, 2)}`} calc={() => fundingSourcesExplain(s)} />
        <Metric label="Liquidity coverage" value={fx(lm.lcr, 2)} tone={lm.lcr < 1 ? C.down : lm.lcr < 1.3 ? C.warn : C.up} sub={`~${lm.survivalDays.toFixed(0)} days survival`} calc={() => lm.lines} />
      </Row>

      <Section title="Customer reserve (15c3-3 style)">
        <Card onPress={() => open(reserveExplain(s))}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T v="caption">Customer credits</T>
              <T v="numLg">{fm(rc.credits)}</T>
            </View>
            <T v="h2" color={C.textFaint}>−</T>
            <View>
              <T v="caption">97% × debits</T>
              <T v="numLg">{fm(rc.debits * 0.97)}</T>
            </View>
            <T v="h2" color={C.textFaint}>=</T>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="caption">Locked in reserve</T>
              <T v="numLg" color={rc.requirement > 0 ? C.warn : C.up}>{fm(rc.requirement)}</T>
            </View>
          </Row>
          <T v="caption" style={{ marginTop: 8 }}>
            {rc.requirement > 0
              ? 'Customer credits exceed customer debits: the excess is locked up and earns only SOFR − 35bp. More client debits (or lender collateral) would put it to work.'
              : 'Customer credits are fully deployed financing customer debits and lender collateral. The rest of the debit book must be funded wholesale.'}
          </T>
        </Card>
      </Section>

      <Section title="Funding sources">
        <Card>
          <T v="h3">Repo against rehypothecated collateral</T>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <T v="small">{fm(bs.liabilities.repo + bs.liabilities.termRepo)} used of {fm(d.repoCapacity)} capacity</T>
            <T v="num">{fpct(repoRate(s), 2)}</T>
          </Row>
          <View style={{ marginTop: 6 }}>
            <Bar value={bs.liabilities.repo + bs.liabilities.termRepo} max={Math.max(d.repoCapacity, 1)} color={C.accent} />
          </View>
          <T v="caption" style={{ marginTop: 6 }}>Haircuts ×{s.market.haircutMult.toFixed(2)} · counterparty appetite {fpct(s.market.repoAppetite, 0)} · term repo {fm(termRepoTotal(s))}</T>
          {s.desk.termRepos.map((t) => (
            <KV key={t.id} k={`Term repo ${t.id}`} v={fm(t.amount)} sub={`SOFR+${t.spreadBps}bp · matures day ${t.maturityDay}`} />
          ))}
        </Card>
        <Card style={{ marginTop: 10 }}>
          <T v="h3">Treasury facility (unsecured FTP)</T>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <T v="small">{fm(bs.liabilities.treasury)} drawn of {fm(s.desk.facilityLimit)}</T>
            <T v="num">{fpct(ftpRate(s), 2)}</T>
          </Row>
          <View style={{ marginTop: 6 }}>
            <Bar value={bs.liabilities.treasury} max={s.desk.facilityLimit} color={C.info} />
          </View>
          <T v="caption" style={{ marginTop: 6 }}>15bp commitment fee on the undrawn amount. Beyond the facility: emergency funding at SOFR+500bp{bs.liabilities.emergency > 0 ? ` — currently ${fm(bs.liabilities.emergency)} drawn` : ''}.</T>
        </Card>
      </Section>

      <Section title="Funding policy">
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={C.text}>Liquidity buffer target</T>
              <T v="caption">HQLA held against stressed outflows; earns SOFR − 10bp.</T>
            </View>
            <Stepper value={pol.bufferTarget} min={0} max={500e6} step={10e6} format={(v) => fm(v)} onChange={(v) => g.policy({ bufferTarget: v })} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={C.text}>Max repo usage</T>
              <T v="caption">Share of eligible collateral you are willing to pledge.</T>
            </View>
            <Stepper value={pol.repoUsage} min={0} max={1} step={0.1} format={(v) => fpct(v, 0)} onChange={(v) => g.policy({ repoUsage: v })} />
          </Row>
          <View>
            <T v="small" color={C.text} style={{ marginBottom: 6 }}>Funding order</T>
            <Segmented value={pol.repoFirst ? 'repo' : 'tsy'} options={[{ id: 'repo', label: 'Repo first' }, { id: 'tsy', label: 'Treasury first' }]} onChange={(v) => g.policy({ repoFirst: v === 'repo' })} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={C.text}>Lock 30-day term repo</T>
              <T v="caption">≈ SOFR+{Math.round(25 + s.market.repoStressBps + 15)}bp fixed. Insurance against roll risk.</T>
            </View>
            <Stepper value={termAmt} min={25e6} max={500e6} step={25e6} format={(v) => fm(v)} onChange={setTermAmt} />
          </Row>
          <Btn title="Lock term repo" icon="lock-closed-outline" onPress={() => setMsg(g.termRepo(termAmt))} />
          {msg ? <T v="small" color={C.accent}>{msg}</T> : null}
        </Card>
      </Section>

      {hist.length > 2 ? (
        <Section title="Wholesale funding history">
          <Card>
            <Sparkline data={hist.map((h) => h.repo + h.treasury + h.emergency)} width={w - 2 * S.lg} height={60} color={C.info} />
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <T v="caption">Day {hist[0].day}</T>
              <T v="caption">Annual funding P&L now {fm(fund.total)}</T>
              <T v="caption">Day {hist[hist.length - 1].day}</T>
            </Row>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
