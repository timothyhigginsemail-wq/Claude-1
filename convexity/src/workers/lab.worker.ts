// Heavy structuring analytics off the main thread.
import { autocallMC, AutocallInst } from '../engine/pricing';
import { MarketView } from '../engine/market';
import { STRESSES, applyStress, instrumentRisk } from '../engine/risk';

export interface LabRequest {
  id: number;
  inst: AutocallInst;
  view: MarketView;
  paths: number;
  withRisk: boolean;
  margin?: number; // if set, solve the coupon so that note PV = 1 − margin
}

self.onmessage = (e: MessageEvent<LabRequest>) => {
  const { id, view, paths, withRisk, margin } = e.data;
  let inst = e.data.inst;
  const base = autocallMC({ ...inst, coupon: 0 }, view, paths);
  if (margin !== undefined) inst = { ...inst, coupon: Math.max(0, (1 - margin - base.pvExCoupon) / Math.max(base.couponAnnuity, 1e-9)) };
  const res = autocallMC(inst, view, paths, { keepPaths: 60, payoffs: true });
  const pay = res.payoffs ?? [];
  const lo = Math.min(...pay);
  const hi = Math.max(...pay);
  const bins = new Array(30).fill(0);
  for (const x of pay) bins[Math.min(29, Math.floor(((x - lo) / Math.max(hi - lo, 1e-9)) * 30))]++;
  const risk = withRisk ? instrumentRisk(inst, view, 8192) : null;
  const stress = withRisk ? STRESSES.map((s) => ({ id: s.id, label: s.label, pv: autocallMC(inst, applyStress(view, s), 4096).pv })) : null;
  (self as unknown as Worker).postMessage({ id, coupon: inst.coupon, A: base.pvExCoupon, B: base.couponAnnuity, res: { ...res, payoffs: undefined }, hist: { bins, lo, hi }, risk, stress });
};
