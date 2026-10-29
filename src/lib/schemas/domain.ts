import { z } from 'zod';
import { TRADE_IN_STATUSES } from '../lifecycle';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const plainText = (max: number) =>
  z.string().trim().max(max).refine((s) => !/[<>]/.test(s), { message: 'html_not_allowed' });
const minor = z.int().min(0).max(100_000_000_00);

export const tradeInStatusSchema = z.enum(TRADE_IN_STATUSES);

// ---- Rules ---------------------------------------------------------------

export const adjustmentSchema = z.discriminatedUnion('kind', [
  // Basis points relative to the base offer; -10000..+10000 (−100%..+100%).
  z.object({ kind: z.literal('percent'), basisPoints: z.int().min(-10000).max(10000) }),
  z.object({ kind: z.literal('fixed'), amountMinor: z.int().min(-100_000_000_00).max(100_000_000_00) }),
  // Selecting this answer makes the item ineligible.
  z.object({ kind: z.literal('reject') }),
]);
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const conditionOptionSchema = z.object({
  id,
  label: plainText(120).min(1),
  adjustment: adjustmentSchema,
});

export const conditionQuestionSchema = z.object({
  id,
  label: plainText(200).min(1),
  helpText: plainText(500).optional(),
  required: z.boolean().default(true),
  options: z.array(conditionOptionSchema).min(2).max(10),
});
export type ConditionQuestion = z.infer<typeof conditionQuestionSchema>;

export const VIDEO_MODES = ['off', 'optional', 'required'] as const;
export type VideoMode = (typeof VIDEO_MODES)[number];

export const ruleInputSchema = z
  .object({
    name: plainText(100).min(1),
    scope: z.enum(['all', 'category', 'product']),
    categoryId: z.string().max(64).optional(),
    productIds: z.array(z.string().max(64)).max(500).default([]),
    // Percentage with up to 2 decimals, stored as a number but converted to basis points for math.
    payoutPercentage: z.number().min(0).max(100).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, 'max_two_decimals'),
    conditionQuestions: z.array(conditionQuestionSchema).max(20).default([]),
    minimumOfferMinor: minor.optional(),
    maximumOfferMinor: minor.optional(),
    photoMinimum: z.int().min(0).max(10).default(2),
    videoMode: z.enum(VIDEO_MODES).default('off'),
    videoMaxSeconds: z.int().min(5).max(300).default(60),
    priority: z.int().min(0).max(1000).default(0),
    enabled: z.boolean().default(true),
  })
  .refine((r) => r.scope !== 'category' || !!r.categoryId, { path: ['categoryId'], message: 'required' })
  .refine((r) => r.scope !== 'product' || r.productIds.length > 0, { path: ['productIds'], message: 'required' })
  .refine(
    (r) => r.minimumOfferMinor === undefined || r.maximumOfferMinor === undefined || r.minimumOfferMinor <= r.maximumOfferMinor,
    { path: ['maximumOfferMinor'], message: 'min_gt_max' },
  );
export type RuleInput = z.infer<typeof ruleInputSchema>;
export type Rule = RuleInput & { _id: string; instanceId: string; version: number };

// ---- Settings ------------------------------------------------------------

const postalAddressSchema = z.object({
  country: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal('')]).default(''),
  line1: plainText(200).default(''),
  line2: plainText(200).default(''),
  city: plainText(100).default(''),
  subdivision: plainText(100).default(''),
  postalCode: plainText(20).default(''),
});

const handoffMethodSchema = z.object({
  enabled: z.boolean(),
  // Display text shown to customers. Built from `location` on save once that has a country and
  // street; older settings may only have this free text.
  address: plainText(500).default(''),
  location: postalAddressSchema.optional(),
  instructions: plainText(2000).default(''),
});

export const NOTIFICATION_EVENTS = {
  merchant: [
    'submitted',
    'cancelled',
    'approved',
    'rejected',
    'quote_accepted',
    'quote_declined',
    'shipped',
    'received',
    'revised_offer_accepted',
    'revised_offer_declined',
    'credit_issued',
    'credit_failed',
    'resale_draft_created',
    'resale_draft_failed',
    'processing_failure',
  ],
  customer: ['submitted', 'quote', 'quote_decision', 'cancellation', 'approved', 'rejected', 'received', 'revised_offer', 'revised_offer_decision', 'return_started', 'returned', 'credit_issued'],
} as const;
export type MerchantNotificationEvent = (typeof NOTIFICATION_EVENTS.merchant)[number];
export type CustomerNotificationEvent = (typeof NOTIFICATION_EVENTS.customer)[number];

const toggles = <T extends readonly string[]>(keys: T, def: boolean) =>
  z.object(Object.fromEntries(keys.map((k) => [k, z.boolean().default(def)])) as Record<T[number], z.ZodDefault<z.ZodBoolean>>);

export const settingsSchema = z.object({
  handoff: z
    .object({
      dropOff: handoffMethodSchema.extend({ enabled: z.boolean().default(true) }),
      shipIn: handoffMethodSchema.extend({ enabled: z.boolean().default(false), allowTracking: z.boolean().default(true) }),
    })
    .refine((h) => h.dropOff.enabled || h.shipIn.enabled, { message: 'one_handoff_required' }),
  credit: z.object({
    // Months until expiry; omitted = no expiry. Applied through Gift Cards `expirationDate`.
    expiryMonths: z.int().min(1).max(120).optional(),
    minimumCreditMinor: minor.default(0),
    sendGiftCardEmail: z.boolean().default(true),
  }),
  // Sanitized HTML from the dashboard editor; the app takes no trade-ins until it has visible text.
  termsHtml: z.string().max(50_000).default(''),
  mediaRetentionDays: z.int().min(1).max(365).default(30),
  revisedOfferExpiryDays: z.int().min(1).max(60).default(14),
  allowCustomerCancel: z.boolean().default(true),
  // Items not in the catalog: the customer describes them and the merchant quotes an offer.
  customItems: z
    .object({
      enabled: z.boolean().default(false),
      photoMinimum: z.int().min(0).max(10).default(2),
    })
    .default({ enabled: false, photoMinimum: 2 }),
  notifications: z.object({
    merchant: toggles(NOTIFICATION_EVENTS.merchant, true),
    customer: toggles(NOTIFICATION_EVENTS.customer, true),
    // Wix user IDs of site collaborators to notify (Email Transmissions supports userId recipients).
    staffUserIds: z.array(z.string().max(64)).max(20).default([]),
    senderName: plainText(100).default(''),
    replyToEmail: z.union([z.email(), z.literal('')]).default(''),
  }),
  defaultLocale: z.string().max(16).default('en'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const SETTINGS_SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return settingsSchema.parse({
    handoff: { dropOff: {}, shipIn: {} },
    credit: {},
    notifications: { merchant: {}, customer: {} },
  });
}

// ---- Trade-in shapes ------------------------------------------------------

export const HANDOFF_METHODS = ['drop_off', 'ship_in'] as const;
export type HandoffMethod = (typeof HANDOFF_METHODS)[number];

// Customer's description of an item that isn't in the catalog. Display text only: the offer is
// always quoted by staff, so the customer's own estimate never sets a value.
export const customItemSchema = z.object({
  name: plainText(120).min(1),
  brand: plainText(80).optional(),
  model: plainText(80).optional(),
  description: plainText(2000).min(1),
  customerEstimateMinor: minor.optional(),
});
export type CustomItem = z.infer<typeof customItemSchema>;

export const conditionAnswersSchema = z.record(id, id);
export type ConditionAnswers = z.infer<typeof conditionAnswersSchema>;

export type OfferBreakdown = {
  basePriceMinor: number;
  payoutBasisPoints: number;
  baseOfferMinor: number;
  adjustments: { questionId: string; optionId: string; kind: 'percent' | 'fixed'; deltaMinor: number }[];
  beforeClampMinor: number;
  clampedTo?: 'minimum' | 'maximum';
  offerMinor: number;
  currency: string;
  ruleId: string;
  ruleVersion: number;
};
