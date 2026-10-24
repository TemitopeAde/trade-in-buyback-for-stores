import { orders } from '@wix/ecom';
import { auth } from '@wix/essentials';

// Past-order selection for logged-in members. The member ID always comes from the verified
// request identity; orders are only ever searched for that member.

// catalogReference.appId for all Wix Stores products (V1 and V3), per Wix docs.
const STORES_CATALOG_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

const elevated = {
  search: auth.elevate(orders.searchOrders),
  get: auth.elevate(orders.getOrder),
};

export type EligibleOrderItem = { orderId: string; orderNumber?: string; productId: string; title: string; imageUrl?: string; purchasedAt?: string };

export class WixOrdersService {
  async eligibleItemsForMember(memberId: string, limit = 50): Promise<EligibleOrderItem[]> {
    const res = await elevated.search({
      filter: { 'buyerInfo.memberId': { $eq: memberId }, paymentStatus: { $eq: 'PAID' } },
      sort: [{ fieldName: '_createdDate', order: 'DESC' }],
      cursorPaging: { limit: Math.min(limit, 100) },
    });
    const out: EligibleOrderItem[] = [];
    const seen = new Set<string>();
    for (const o of res.orders ?? []) {
      for (const li of o.lineItems ?? []) {
        const ref = li.catalogReference;
        if (!ref?.catalogItemId || !o._id || ref.appId !== STORES_CATALOG_APP_ID) continue;
        const key = `${o._id}:${ref.catalogItemId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          orderId: o._id,
          orderNumber: o.number ?? undefined,
          productId: ref.catalogItemId,
          title: li.productName?.original ?? '',
          imageUrl: li.image ?? undefined,
          purchasedAt: o._createdDate ? new Date(o._createdDate).toISOString() : undefined,
        });
      }
    }
    return out;
  }

  /** True only if the order belongs to this member and contains the product. */
  async verifyMemberOrderItem(memberId: string, orderId: string, productId: string): Promise<boolean> {
    try {
      const order = await elevated.get(orderId);
      if (order.buyerInfo?.memberId !== memberId) return false;
      return (order.lineItems ?? []).some((li) => li.catalogReference?.catalogItemId === productId);
    } catch {
      return false;
    }
  }
}
