import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fm, fpct, fx } from '../../engine/format';
import { externalSupply, internalSupply } from '../../engine/lending';
import type { ClientTerms, EventOption, GameEvent, GameState } from '../../engine/types';
import { EVENT_TOPIC, TOPICS } from '../../game/education';
import { likelihoodLabel, onboardingAcceptProb, type PreviewResult } from '../../game/events';
import { FlowDiagram, type FlowEdge, type FlowNode } from '../components/charts';
import { useContentWidth } from '../components/Screen';
import { TermsEditor } from '../components/TermsEditor';
import { Btn, Card, FactGrid, Pill, Row, Sheet, Stepper, T } from '../components/ui';
import { useGame } from '../GameContext';
import { LearnCard } from '../components/Learn';
import { C, S } from '../theme';

export const KIND_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  onboarding: { icon: 'person-add-outline', label: 'Mandate', color: C.accent },
  financingRequest: { icon: 'trending-up-outline', label: 'Financing', color: C.info },
  borrowRequest: { icon: 'git-pull-request-outline', label: 'Stock borrow', color: C.info },
  fundingShock: { icon: 'water-outline', label: 'Treasury', color: C.warn },
  termFunding: { icon: 'time-outline', label: 'Treasury', color: C.textDim },
  squeezeAlert: { icon: 'flame-outline', label: 'Risk', color: C.down },
  marginCall: { icon: 'alert-circle-outline', label: 'Margin', color: C.down },
  marginDefault: { icon: 'warning-outline', label: 'Default', color: C.down },
  recall: { icon: 'return-down-back-outline', label: 'Recall', color: C.warn },
  borrowReprice: { icon: 'pricetag-outline', label: 'Borrow fee', color: C.warn },
  competitorOffer: { icon: 'flash-outline', label: 'Competition', color: C.warn },
  giveUp: { icon: 'swap-horizontal-outline', label: 'Give-up', color: C.textDim },
  redemption: { icon: 'exit-outline', label: 'Redemptions', color: C.warn },
  managementReview: { icon: 'business-outline', label: 'Management', color: C.accent },
  counterpartyNews: { icon: 'newspaper-outline', label: 'Market', color: C.warn },
  crowding: { icon: 'people-circle-outline', label: 'Risk', color: C.warn },
  info: { icon: 'information-circle-outline', label: 'Info', color: C.textDim },
};

function fmtParam(o: EventOption, v: number) {
  const u = o.param!.unit;
  if (u === 'bps') return `${Math.round(v)}bp`;
  if (u === '$') return fm(v);
  if (u === 'x') return `${v.toFixed(2)}×`;
  return `${Math.round(v * 100)}%`;
}

function flowFor(s: GameState, ev: GameEvent): { nodes: FlowNode[]; edges: FlowEdge[]; caption: string } | null {
  const c = ev.clientId ? s.clients[ev.clientId] : undefined;
  if (ev.kind === 'borrowRequest' && c && ev.secId) {
    const sec = s.securities[ev.secId];
    const value = ev.data.qty * sec.price;
    const internal = internalSupply(s, ev.secId, c.id).filter((r) => r.source === 'rehyp').reduce((a, r) => a + r.value, 0);
    const intUsed = Math.min(internal, value);
    const ext = value - intUsed;
    const holder = internalSupply(s, ev.secId, c.id).filter((r) => r.source === 'rehyp' && r.value > 0).sort((a, b) => b.value - a.value)[0];
    const lender = externalSupply(s, ev.secId)[0];
    const nodes: FlowNode[] = [
      { id: 'client', label: c.short, sub: 'short seller', x: 0, y: 0 },
      { id: 'atlas', label: 'Atlas PB', x: 0.5, y: 0.5 },
      { id: 'street', label: 'Street buyer', x: 1, y: 0 },
      { id: 'lender', label: lender ? lender.name.split(' ')[0] : 'Lender', sub: 'external lender', x: 1, y: 1 },
      { id: 'fundA', label: holder?.clientId ? s.clients[holder.clientId].short : 'Other clients', sub: 'margin longs', x: 0, y: 1 },
    ];
    const edges: FlowEdge[] = [
      { from: 'atlas', to: 'street', kind: 'sec', label: `${ev.secId} ${fm(value)}` },
      { from: 'street', to: 'atlas', kind: 'cash', label: `proceeds ${fm(value)}` },
      { from: 'atlas', to: 'client', kind: 'cash', label: `rebate SOFR−fee` },
    ];
    if (intUsed > 0) edges.push({ from: 'fundA', to: 'atlas', kind: 'sec', label: `rehyp ${fm(intUsed)}` });
    if (ext > 0) {
      edges.push({ from: 'lender', to: 'atlas', kind: 'sec', label: `borrow ${fm(ext)}` });
      edges.push({ from: 'atlas', to: 'lender', kind: 'cash', label: `102% coll. ${fm(ext * 1.02)}` });
    }
    return {
      nodes,
      edges,
      caption: `Short-sale proceeds land at Atlas in the client's short account. The internalised ${fm(intUsed)} keeps its proceeds in-house (funding other clients' debits); the external ${fm(ext)} sends ${fm(ext * 1.02)} of cash to the lender as collateral, which earns Atlas SOFR − lender fee.`,
    };
  }
  if (ev.kind === 'giveUp' && c && ev.secId) {
    const v = ev.data.qty * s.securities[ev.secId].price;
    return {
      nodes: [
        { id: 'eb', label: (ev.data.eb as string).split(' ')[0], sub: 'executing broker', x: 1, y: 0 },
        { id: 'atlas', label: 'Atlas PB', x: 0.5, y: 0.55 },
        { id: 'client', label: c.short, sub: 'fund', x: 0, y: 0 },
        { id: 'custody', label: 'Custody', sub: 'client account', x: 0, y: 1 },
      ],
      edges: [
        { from: 'eb', to: 'atlas', kind: 'sec', label: `${ev.secId} ${fm(v)}` },
        { from: 'atlas', to: 'eb', kind: 'cash', label: `settles ${fm(v)}` },
        { from: 'atlas', to: 'custody', kind: 'sec', label: 'held as collateral' },
        { from: 'atlas', to: 'client', kind: 'cash', label: `margin loan` },
      ],
      caption: 'Once accepted, Atlas owes the executing broker the settlement amount regardless of whether the fund pays; the fund then owes Atlas via its margin loan, secured by the shares in custody.',
    };
  }
  if ((ev.kind === 'financingRequest' || ev.kind === 'onboarding') && c) {
    return {
      nodes: [
        { id: 'client', label: c.short, sub: 'equity + positions', x: 0, y: 0 },
        { id: 'atlas', label: 'Atlas PB', x: 0.5, y: 0.5 },
        { id: 'street', label: 'Street', sub: 'sellers', x: 1, y: 0 },
        { id: 'repo', label: 'Repo cpty', sub: 'secured funding', x: 1, y: 1 },
        { id: 'tsy', label: 'Treasury', sub: 'FTP funding', x: 0, y: 1 },
      ],
      edges: [
        { from: 'client', to: 'atlas', kind: 'cash', label: 'equity (margin)' },
        { from: 'atlas', to: 'street', kind: 'cash', label: 'pays for longs' },
        { from: 'street', to: 'atlas', kind: 'sec', label: 'shares (custody)' },
        { from: 'atlas', to: 'repo', kind: 'sec', label: 'rehyp ≤140% debit' },
        { from: 'repo', to: 'atlas', kind: 'cash', label: 'cash − haircut' },
        { from: 'tsy', to: 'atlas', kind: 'cash', label: 'balance' },
      ],
      caption: 'The debit balance is funded first by customer credits (within the reserve formula), then by repo against the client’s own rehypothecated securities, then by treasury.',
    };
  }
  return null;
}

export function EventSheet({ ev, onClose }: { ev: GameEvent | null; onClose: () => void }) {
  const g = useGame();
  const s = g.s!;
  const w = useContentWidth();
  const [params, setParams] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<{ opt: string; res: PreviewResult | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [showFlow, setShowFlow] = useState(false);
  const [learn, setLearn] = useState<string | null>(null);

  useEffect(() => {
    setParams({});
    setPreview(null);
    setOutcome(null);
    setShowFlow(false);
    setLearn(null);
  }, [ev?.id]);

  if (!ev) return null;
  const live = s.events.find((e) => e.id === ev.id) ?? ev;
  const meta = KIND_META[live.kind] ?? KIND_META.info;
  const flow = flowFor(s, live);
  const topics = EVENT_TOPIC[live.kind] ?? [];
  const resolved = live.status !== 'pending';
  const c = live.clientId ? s.clients[live.clientId] : undefined;

  const runPreview = (o: EventOption) => {
    setBusy(o.id);
    setTimeout(() => {
      const res = g.preview(live.id, o.id, params[o.id]);
      setPreview({ opt: o.id, res });
      setBusy(null);
    }, 10);
  };

  const choose = (o: EventOption) => {
    const out = g.resolve(live.id, o.id, params[o.id]);
    if (o.usesAnalyst) return;
    setOutcome(out);
  };

  const proposal = live.data.proposal as ClientTerms | undefined;
  const acceptP = live.kind === 'onboarding' && c && proposal ? onboardingAcceptProb(s, c, proposal, live.data.round) : null;

  return (
    <Sheet visible={!!ev} onClose={onClose} title={`${live.time} · ${meta.label}`}>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
        {live.urgent ? <Pill text="Urgent" color={C.down} filled /> : null}
        {c ? <Pill text={c.short} color={c.color} /> : null}
        {live.secId ? <Pill text={live.secId} color={C.info} /> : null}
      </Row>
      <T v="h2" style={{ marginBottom: 8 }}>{live.title}</T>
      <T v="body" color={C.textDim}>{live.body}</T>

      {topics.length ? (
        <Row gap={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {topics.map((t) => (
            <Pressable key={t} onPress={() => { g.seeTopic(t); setLearn(learn === t ? null : t); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: learn === t ? C.accent + '33' : C.surface3 }}>
              <Ionicons name="school-outline" size={12} color={C.accent} />
              <T v="caption" color={C.accent}>{TOPICS[t]?.title ?? t}</T>
              {!s.seenTopics.includes(t) ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }} /> : null}
            </Pressable>
          ))}
        </Row>
      ) : null}
      {learn ? <LearnCard topic={learn} /> : null}

      <Card style={{ marginTop: S.md, padding: S.md }}>
        <FactGrid facts={live.facts} />
      </Card>

      {flow ? (
        <View style={{ marginTop: S.md }}>
          <Pressable onPress={() => setShowFlow(!showFlow)}>
            <Row gap={6}>
              <Ionicons name={showFlow ? 'chevron-down' : 'chevron-forward'} size={14} color={C.accent} />
              <T v="small" color={C.accent}>Cash & securities flow</T>
            </Row>
          </Pressable>
          {showFlow ? (
            <Card style={{ marginTop: 8, padding: S.md }}>
              <FlowDiagram nodes={flow.nodes} edges={flow.edges} width={w - 2 * S.md - 2} height={230} />
              <T v="caption" style={{ marginTop: 8 }}>{flow.caption}</T>
            </Card>
          ) : null}
        </View>
      ) : null}

      {live.kind === 'onboarding' && proposal && !resolved ? (
        <Card style={{ marginTop: S.md }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <T v="h3">Your term sheet</T>
            {acceptP !== null ? <Pill text={`Banker's read: ${likelihoodLabel(acceptP)}`} color={acceptP > 0.6 ? C.up : acceptP > 0.4 ? C.warn : C.down} /> : null}
          </Row>
          <TermsEditor terms={proposal} compare={c?.ask} compact onChange={(p) => g.editProposal(live.id, p)} />
        </Card>
      ) : null}

      {live.analysis?.length ? (
        <Card style={{ marginTop: S.md }} accent={C.info}>
          <Row gap={6} style={{ marginBottom: 6 }}>
            <Ionicons name="analytics-outline" size={15} color={C.info} />
            <T v="h3">Risk analyst</T>
          </Row>
          {live.analysis.map((a, i) => (
            <T key={i} v="small" style={{ marginTop: 4 }}>• {a}</T>
          ))}
        </Card>
      ) : null}

      {resolved || outcome ? (
        <Card style={{ marginTop: S.lg }} accent={C.accent}>
          <T v="label">Outcome</T>
          <T v="body" style={{ marginTop: 6 }}>{outcome ?? live.resolution}</T>
          <Btn title="Done" tone="primary" onPress={onClose} style={{ marginTop: S.md }} />
        </Card>
      ) : (
        <View style={{ marginTop: S.lg, gap: 10 }}>
          <T v="label">Your decision</T>
          {live.options.map((o) => {
            const pv = preview?.opt === o.id ? preview.res : null;
            const analystOut = o.usesAnalyst && s.desk.analystUsed >= s.desk.analystCapacity;
            return (
              <Card key={o.id} style={{ padding: S.md }} accent={o.tone === 'primary' ? C.accent : o.tone === 'danger' ? C.down : undefined}>
                <T v="h3">{o.label}</T>
                <T v="small" style={{ marginTop: 3 }}>{o.detail}</T>
                {o.param ? (
                  <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                    <T v="small" color={C.text}>{o.param.label}</T>
                    <Stepper value={params[o.id] ?? o.param.value} min={o.param.min} max={o.param.max} step={o.param.step} format={(v) => fmtParam(o, v)} onChange={(v) => { setParams({ ...params, [o.id]: v }); setPreview(null); }} />
                  </Row>
                ) : null}
                {pv ? (
                  <View style={{ marginTop: 10, backgroundColor: C.surface2, borderRadius: 8, padding: 10 }}>
                    <T v="label" style={{ marginBottom: 4 }}>Impact if accepted (your desk model)</T>
                    {pv.rows.map((r) => {
                      const d = r.after - r.before;
                      const f = (x: number) => (r.fmt === 'pct' ? fpct(x) : r.fmt === 'x' ? fx(x, 2) : fm(x));
                      return (
                        <Row key={r.label} style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                          <T v="caption" style={{ flex: 1 }}>{r.label}</T>
                          <T v="caption" color={C.textDim}>{f(r.before)} → </T>
                          <T v="caption" color={Math.abs(d) < 1e-6 ? C.textDim : C.text} style={{ fontWeight: '600' }}>{f(r.after)}</T>
                        </Row>
                      );
                    })}
                  </View>
                ) : null}
                <Row gap={8} style={{ marginTop: 10 }}>
                  {!o.usesAnalyst ? (
                    <Btn small title={busy === o.id ? '…' : 'Preview impact'} icon="eye-outline" tone="ghost" onPress={() => runPreview(o)} style={{ flex: 1 }} />
                  ) : null}
                  <Btn small title={o.usesAnalyst ? (analystOut ? 'No analyst time' : `Assign analyst (${s.desk.analystCapacity - s.desk.analystUsed} left)`) : 'Choose'} tone={o.tone === 'danger' ? 'danger' : 'primary'} disabled={analystOut || (o.usesAnalyst && !!live.analysis)} onPress={() => choose(o)} style={{ flex: 1 }} />
                </Row>
                {busy === o.id ? <ActivityIndicator color={C.accent} style={{ marginTop: 6 }} /> : null}
              </Card>
            );
          })}
          <T v="caption" style={{ marginTop: 4 }}>Previews assume the counterparty accepts; real outcomes depend on their alternatives and your relationship. Unanswered items take a default action at the close.</T>
        </View>
      )}
    </Sheet>
  );
}
