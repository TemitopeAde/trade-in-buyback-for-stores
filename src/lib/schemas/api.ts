import { z } from 'zod';
import type { TradeInAction, TradeInStatus } from '../lifecycle';
import type { MediaKind } from '../media-limits';
import { conditionAnswersSchema, HANDOFF_METHODS, type HandoffMethod, type VideoMode } from './domain';

// Request schemas and response DTOs shared by widgets/dashboard (clients) and API routes.
// Clients use them for early validation and typing; servers re-validate every request.

const productId = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);
const idempotencyKey = z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/);
const accessToken = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);
const plain = (max: number) => z.string().trim().max(max).refine((s) => !/[<>]/.test(s), 'html_not_allowed');

// ---- Customer (site widgets) ----

export const catalogSearchRequest = z.object({
  q: z.string().max(80).default(''),
  cursor: z.string().max(512).optional(),
});
export type CatalogSearchResponse = { items: CatalogItem[]; nextCursor?: string; hasMore: boolean };
export const productRequest = z.object({ productId });
export const estimateRequest = z.object({ productId, answers: conditionAnswersSchema.default({}) });

export const uploadRequest = z.object({
  uploadSessionId: z.string().min(40).max(64).optional(),
  kind: z.enum(['photo', 'video']),
  mimeType: z.string().min(3).max(100),
  fileName: z.string().min(1).max(200),
  sizeBytes: z.int().positive(),
  durationSeconds: z.number().positive().max(3600).optional(),
});
export const confirmUploadRequest = z.object({
  uploadSessionId: z.string().min(40).max(64),
  mediaId: z.string().min(1).max(64),
  fileId: z.string().min(1).max(300),
});
export const sessionStatusRequest = z.object({ uploadSessionId: z.string().min(40).max(64) });

export const submitRequest = z.object({
  submissionKey: idempotencyKey,
  productId,
  orderId: z.string().max(64).optional(),
  answers: conditionAnswersSchema,
  uploadSessionId: z.string().min(40).max(64).optional(),
  mediaIds: z.array(z.string().min(1).max(64)).max(12).default([]),
  handoffMethod: z.enum(HANDOFF_METHODS),
  contact: z.object({
    name: plain(120).min(1),
    email: z.email().max(200),
    phone: plain(40).optional(),
  }),
  acceptTerms: z.literal(true),
  locale: z.string().max(16).default('en'),
});
export type SubmitRequest = z.infer<typeof submitRequest>;

export const customerLookupRequest = z.object({ token: accessToken.optional(), tradeInId: z.string().max(64).optional() })
  .refine((r) => r.token || r.tradeInId, 'token_or_id');

export const CUSTOMER_ACTIONS = ['cancel', 'mark_in_transit', 'accept_revised_offer', 'decline_revised_offer'] as const satisfies readonly TradeInAction[];
export const customerActionRequest = z.object({
  token: accessToken.optional(),
  tradeInId: z.string().max(64).optional(),
  action: z.enum(CUSTOMER_ACTIONS),
  expectedRevision: z.int().min(1),
  trackingNumber: plain(80).optional(),
  idempotencyKey,
});

export const myTradeInsRequest = z.object({ cursor: z.int().min(0).max(10_000).default(0) });

// ---- Response DTOs ----

export type PublicQuestion = { id: string; label: string; helpText?: string; required: boolean; options: { id: string; label: string }[] };

export type FormConfig = {
  eligible: boolean;
  /** False when the store has used this month's trade-in requests on its plan. */
  accepting: boolean;
  /** Photo/video uploads are available on the store's plan. */
  uploads: boolean;
  product?: { productId: string; title: string; imageUrl?: string };
  questions: PublicQuestion[];
  media: { photoMinimum: number; videoMode: VideoMode; videoMaxSeconds: number };
  handoffMethods: { method: HandoffMethod; address?: string; instructions?: string }[];
  termsText: string;
  upToMinor?: number;
  currency?: string;
  statusPageUrl?: string;
};

export type ProductCtaResponse = { eligible: boolean; upToMinor?: number; currency?: string; formPageUrl?: string };

export type EstimateResponse =
  | { eligible: true; offerMinor: number; currency: string; complete: boolean }
  | { eligible: false; reason: string };

export type CatalogItem = { productId: string; title: string; imageUrl?: string; orderId?: string; source: 'catalog' | 'order' };

export type UploadTarget = { uploadSessionId: string; mediaId: string; fileName: string; protocol: 'put' | 'tus'; uploadUrl: string; uploadToken?: string };
export type MediaStatus = { mediaId: string; kind: MediaKind; status: 'requested' | 'processing' | 'ready' | 'failed' };

export type SubmitResponse = { tradeInId: string; reference: string; accessToken: string };

export type CustomerTimelineEntry = { status: TradeInStatus; at: string };

export type CustomerTradeInView = {
  tradeInId: string;
  reference: string;
  status: TradeInStatus;
  revision: number;
  createdAt: string;
  product: { title: string; imageUrl?: string };
  currency: string;
  estimatedValueMinor: number;
  finalValueMinor?: number;
  revisedOffer?: { amountMinor: number; reason?: string; expiresAt?: string };
  rejectionReason?: string;
  /** True when the gift card code is known not to have been emailed (the store sends it instead). */
  giftCardCodePending?: boolean;
  handoff: { method: HandoffMethod; address?: string; instructions?: string; trackingNumber?: string; allowTracking: boolean };
  actions: (typeof CUSTOMER_ACTIONS)[number][];
  timeline: CustomerTimelineEntry[];
};

export type MyTradeInRow = { tradeInId: string; reference: string; status: TradeInStatus; productTitle: string; createdAt: string; estimatedValueMinor: number; currency: string };
export type MyTradeInsResponse = { items: MyTradeInRow[]; nextCursor?: number; signedIn: boolean; statusPageUrl?: string; formPageUrl?: string };

export type ApiError = { error: { code: string; fields?: Record<string, string> } };
