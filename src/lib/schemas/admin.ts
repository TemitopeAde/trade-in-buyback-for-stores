import { z } from 'zod';
import { TRADE_IN_STATUSES, type ActorType, type TradeInAction, type TradeInStatus } from '../lifecycle';
import type { HandoffMethod, OfferBreakdown } from './domain';

// Merchant dashboard contracts (requests validated on the server; DTOs typed for the UI).

const idempotencyKey = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const id = z.string().min(1).max(64);
const plain = (max: number) => z.string().trim().max(max).refine((s) => !/[<>]/.test(s), 'html_not_allowed');

export const ADMIN_SORTS = ['created_desc', 'created_asc', 'value_desc', 'value_asc'] as const;

export const adminListRequest = z.object({
  q: z.string().trim().max(120).default(''),
  status: z.enum(TRADE_IN_STATUSES).optional(),
  statusGroup: z.enum(['needs_review', 'awaiting_handoff', 'in_inspection', 'awaiting_customer', 'credit', 'closed']).optional(),
  categoryId: z.string().max(64).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(ADMIN_SORTS).default('created_desc'),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});
export type AdminListRequest = z.infer<typeof adminListRequest>;

/** Status groups used by overview cards and list filters. */
export const STATUS_GROUPS: Record<NonNullable<AdminListRequest['statusGroup']>, TradeInStatus[]> = {
  needs_review: ['submitted', 'under_review'],
  awaiting_handoff: ['approved', 'in_transit'],
  in_inspection: ['received', 'inspection'],
  awaiting_customer: ['revised_offer_pending'],
  credit: ['credit_pending', 'credit_issued', 'revised_offer_accepted'],
  closed: ['closed', 'cancelled', 'rejected', 'return_pending', 'revised_offer_declined'],
};

export const MERCHANT_ACTIONS = [
  'start_review', 'approve', 'reject', 'cancel', 'mark_in_transit', 'receive', 'start_inspection', 'confirm_value',
  'send_revised_offer', 'reject_after_inspection', 'accept_revised_offer', 'decline_revised_offer', 'mark_returned', 'close',
] as const satisfies readonly TradeInAction[];
export type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

export const adminActionRequest = z.object({
  tradeInId: id,
  action: z.enum(MERCHANT_ACTIONS),
  expectedRevision: z.int().min(1),
  idempotencyKey,
  reason: plain(1000).optional(),
  inspectionNotes: plain(2000).optional(),
  revisedValueMinor: z.int().min(1).max(100_000_000_00).optional(),
  trackingNumber: plain(80).optional(),
});
export type AdminActionRequest = z.infer<typeof adminActionRequest>;

export const adminNoteRequest = z.object({ tradeInId: id, text: plain(2000).min(1), expectedRevision: z.int().min(1).optional() });
export const adminDetailRequest = z.object({ id });
export const ruleIdRequest = z.object({ id });
export const ruleSaveRequest = z.object({ id: id.optional(), rule: z.unknown() });
export const rulePreviewRequest = z.object({ rule: z.unknown(), priceMinor: z.int().min(0).max(100_000_000_00), currency: z.string().length(3), answers: z.record(z.string(), z.string()).default({}) });

// ---- DTOs ----

export type AdminTradeInRow = {
  id: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  productTitle: string;
  categoryId?: string;
  estimatedValueMinor: number;
  finalValueMinor?: number;
  currency: string;
  status: TradeInStatus;
  giftCardStatus: string;
  createdAt: string;
};

export type AdminListResponse = { items: AdminTradeInRow[]; total: number; page: number; pageSize: number };

export type AdminTimelineEntry = {
  id: string;
  eventType: string;
  fromStatus?: TradeInStatus;
  toStatus?: TradeInStatus;
  actorType: ActorType;
  reason?: string;
  at: string;
  metadata?: Record<string, unknown>;
};

export type AdminTradeInDetail = AdminTradeInRow & {
  revision: number;
  customerPhone?: string;
  memberId?: string;
  orderId?: string;
  productId: string;
  productImageUrl?: string;
  conditionAnswers: { questionId: string; optionId: string; question: string; answer: string }[];
  offerBreakdown: OfferBreakdown;
  revisedValueMinor?: number;
  revisedOfferReason?: string;
  revisedOfferExpiresAt?: string;
  handoffMethod: HandoffMethod;
  trackingNumber?: string;
  rejectionReason?: string;
  inspectionNotes?: string;
  returnStatus?: string;
  giftCardId?: string;
  giftCardIssuedAt?: string;
  giftCardEmailStatus?: 'sending' | 'sent' | 'failed' | 'disabled';
  resaleProductId?: string;
  resaleDraftStatus: string;
  notes: { id: string; text: string; createdAt: string }[];
  media: { mediaId: string; kind: 'photo' | 'video'; status: string; url?: string }[];
  timeline: AdminTimelineEntry[];
  actions: MerchantAction[];
};

export const CTA_PLUGIN_ID = '878529eb-fc6b-410f-ac98-90672c15aac4';

export type PluginPlacementStatus = {
  pluginId: string;
  placedInSlot: boolean;
};

export type PluginPlacementResponse = {
  placementStatuses: PluginPlacementStatus[];
};

export type OverviewResponse = {
  counts: Record<keyof typeof STATUS_GROUPS, number>;
  creditIssuedMinorByCurrency: Record<string, number>;
  recent: AdminTimelineEntry[];
  setup: SetupChecklist;
  /** Trade-in requests this calendar month against the plan allowance (limit null = unlimited). */
  usage: { used: number; limit: number | null };
};

export type SetupChecklist = {
  storesInstalled: boolean;
  catalogVersion: string;
  hasRules: boolean;
  settingsSaved: boolean;
  formPageConfigured: boolean;
  statusPageConfigured: boolean;
  pluginPlaced?: boolean;
  giftCardsAvailable?: boolean;
  /** False when the most recent Wix gift card email failed; omitted until one was attempted. */
  giftCardEmailWorking?: boolean;
  emailConfigured?: boolean;
};
