import { auth } from '@wix/essentials';
import { giftVouchers } from '@wix/gift-vouchers';
import { toMinor } from '../../lib/money';
import { COLLECTIONS } from '../collections';
import type { Repo } from '../repo';
import type { TradeInDoc } from '../types';

// Reporting from persisted records only. Redemption uses Wix gift card balances (one batched
// query for up to 100 cards); figures beyond that cap are reported as partial.

export type Report = {
  from: string;
  to: string;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  creditIssuedCount: number;
  conversionRate: number;
  byStatus: Record<string, number>;
  creditIssuedMinorByCurrency: Record<string, number>;
  creditRedeemedMinorByCurrency: Record<string, number>;
  redemptionPartial: boolean;
  averageOfferMinorByCurrency: Record<string, number>;
  resaleDrafts: number;
  truncated: boolean;
};

export type BalancePort = (giftCardIds: string[]) => Promise<{ id: string; initial: string; balance: string; currency: string }[]>;

const queryCards = auth.elevate(giftVouchers.queryGiftCards);

export const wixBalances: BalancePort = async (ids) => {
  if (!ids.length) return [];
  const res = await queryCards({ filter: { _id: { $in: ids } }, cursorPaging: { limit: 100 } });
  return (res.giftCards ?? []).map((c) => ({ id: c._id ?? '', initial: c.initialValue?.amount ?? '0', balance: c.balance?.amount ?? '0', currency: c.currency ?? '' }));
};

const LIMIT = 1000;

export class ReportingService {
  constructor(private readonly repo: Repo, private readonly balances: BalancePort = wixBalances) {}

  async report(instanceId: string, days: number, now = new Date()): Promise<Report> {
    const from = new Date(now.getTime() - days * 86_400_000);
    const res = await this.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId, _createdDate: { $gte: from } }, { limit: LIMIT });
    const docs = res.items;
    const byStatus: Record<string, number> = {};
    const issued: Record<string, number> = {};
    const offers: Record<string, { sum: number; n: number }> = {};
    let approved = 0;
    for (const d of docs) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      if (!['submitted', 'under_review', 'rejected', 'cancelled'].includes(d.status)) approved++;
      if (d.giftCardStatus === 'issued' && d.finalValueMinor) issued[d.currency] = (issued[d.currency] ?? 0) + d.finalValueMinor;
      const o = (offers[d.currency] ??= { sum: 0, n: 0 });
      o.sum += d.estimatedValueMinor;
      o.n++;
    }
    const issuedDocs = docs.filter((d) => d.giftCardStatus === 'issued' && d.giftCardId);
    const redeemed: Record<string, number> = {};
    let redemptionPartial = issuedDocs.length > 100;
    try {
      for (const c of await this.balances(issuedDocs.slice(0, 100).map((d) => d.giftCardId!))) {
        if (!c.currency) continue;
        redeemed[c.currency] = (redeemed[c.currency] ?? 0) + Math.max(0, toMinor(c.initial, c.currency) - toMinor(c.balance, c.currency));
      }
    } catch {
      redemptionPartial = true;
    }
    const creditIssuedCount = issuedDocs.length;
    return {
      from: from.toISOString(),
      to: now.toISOString(),
      submitted: docs.length,
      approved,
      rejected: byStatus.rejected ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      creditIssuedCount,
      conversionRate: docs.length ? Math.round((creditIssuedCount / docs.length) * 1000) / 10 : 0,
      byStatus,
      creditIssuedMinorByCurrency: issued,
      creditRedeemedMinorByCurrency: redeemed,
      redemptionPartial,
      averageOfferMinorByCurrency: Object.fromEntries(Object.entries(offers).map(([c, o]) => [c, Math.round(o.sum / o.n)])),
      resaleDrafts: docs.filter((d) => d.resaleDraftStatus === 'created').length,
      truncated: docs.length >= LIMIT,
    };
  }
}
