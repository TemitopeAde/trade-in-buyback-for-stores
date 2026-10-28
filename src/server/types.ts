import type { ActorType, TradeInStatus } from '../lib/lifecycle';
import type { ConditionAnswers, CustomItem, HandoffMethod, OfferBreakdown, VideoMode } from '../lib/schemas/domain';
import type { Doc } from './repo';

export type ProductSnapshot = {
  title: string;
  imageUrl?: string;
  sku?: string;
  priceMinor: number;
  currency: string;
  /** Absent for custom items, which aren't in the catalog. */
  catalogVersion?: 'V1_CATALOG' | 'V3_CATALOG';
  categoryIds: string[];
};

export type InternalNote = { id: string; authorId: string; text: string; createdAt: string };

export type GiftCardStatus = 'not_started' | 'pending' | 'issued' | 'failed' | 'reconcile_required';
/**
 * Whether Wix's gift card email (the only way the code reaches the customer) went out. 'sending'
 * is claimed before the send so a retry never sends twice. Unset on credit issued before this
 * was tracked (those emails were sent), so only 'failed' and 'disabled' mean the code is missing.
 */
export type GiftCardEmailStatus = 'sending' | 'sent' | 'failed' | 'disabled';
export type ResaleDraftStatus = 'not_started' | 'pending' | 'created' | 'failed';

export type TradeInDoc = Doc & {
  instanceId: string;
  reference: string;
  customerContactId?: string;
  memberId?: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  productId: string;
  variantId?: string;
  orderId?: string;
  categoryId?: string;
  productTitle: string;
  productSnapshot: ProductSnapshot;
  /** Set when the customer described an item that isn't in the catalog; productId is then ''. */
  customItem?: CustomItem;
  conditionAnswers: ConditionAnswers;
  /** Custom items: 0 until the customer accepts a quote, then the quoted amount. */
  estimatedValueMinor: number;
  quotedValueMinor?: number;
  quoteExpiresAt?: Date;
  finalValueMinor?: number;
  revisedValueMinor?: number;
  revisedOfferReason?: string;
  revisedOfferExpiresAt?: Date;
  currency: string;
  offerCalculationVersion: number;
  /** Absent for custom items: their offer is quoted by staff, not calculated. */
  offerBreakdown?: OfferBreakdown;
  status: TradeInStatus;
  revision: number;
  handoffMethod: HandoffMethod;
  trackingNumber?: string;
  rejectionReason?: string;
  inspectionNotes?: string;
  internalNotes: InternalNote[];
  returnStatus?: 'pending' | 'returned';
  giftCardId?: string;
  giftCardStatus: GiftCardStatus;
  giftCardIssuedAt?: Date;
  giftCardIdempotencyKey?: string;
  giftCardEmailStatus?: GiftCardEmailStatus;
  /** When the last send attempt finished. */
  giftCardEmailAt?: Date;
  resaleProductId?: string;
  resaleDraftStatus: ResaleDraftStatus;
  submissionKey: string;
  locale: string;
  closedAt?: Date;
  /** Media requirements captured at submission so later rule edits don't change them. */
  mediaRequirements?: { photoMinimum: number; videoMode: VideoMode; videoMaxSeconds: number };
  /** Terms the customer accepted at submission; absent on requests made before this was recorded. */
  termsHtml?: string;
  termsAcceptedAt?: Date;
};

export type TradeInEventDoc = Doc & {
  instanceId: string;
  tradeInId: string;
  eventType: string;
  fromStatus?: TradeInStatus;
  toStatus?: TradeInStatus;
  actorType: ActorType;
  actorId?: string;
  reason?: string;
  metadataSanitized?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type Actor = { type: ActorType; id?: string };

/**
 * Left on the events collection when a merchant deletes a request created this month, so the
 * deletion still counts toward the plan's monthly allowance. Holds no customer data.
 */
export const TRADE_IN_DELETED_EVENT = 'trade_in.deleted';
