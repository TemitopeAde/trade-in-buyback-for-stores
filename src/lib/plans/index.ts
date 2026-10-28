import type { CustomerNotificationEvent, MerchantNotificationEvent, Settings } from '../schemas/domain';

export type PlanTier = 'basic' | 'pro' | 'business';

export const APP_ID = '85628c65-b784-484a-b1c9-3182e192c1fd';

export interface PlanEntitlements {
  maxRules: number;
  /** Whether the merchant can apply rules to 'all' products */
  allowAllProductsScope: boolean;
  /** Whether the merchant can apply rules to categories */
  allowCategoryScope: boolean;
  /** Maximum number of products allowed on a product-scoped rule */
  maxProductsPerRule: number;
  resaleDrafts: boolean;
  csvExport: boolean;
  advancedStyling: boolean;
  expeditedRetry: boolean;
  maxReportDays: number;
  /** New trade-in requests accepted per calendar month (UTC). */
  maxRequestsPerMonth: number;
  /** Ship-in hand-off (with tracking); without it only drop-off is offered. */
  shipIn: boolean;
  /** Customer photo/video evidence uploads. */
  mediaUploads: boolean;
  /** Revised offers after inspection; without it staff can only confirm the value or reject. */
  revisedOffers: boolean;
  /** Customer emails allowed on this plan; 'all' means every event. */
  customerEmails: readonly CustomerNotificationEvent[] | 'all';
  /** Team emails allowed on this plan; 'all' means every event. */
  merchantEmails: readonly MerchantNotificationEvent[] | 'all';
  maxStaffRecipients: number;
  /** Custom sender name and reply-to address on emails. */
  customSender: boolean;
  /** Tools exposed to the Wix AI assistant (Aria). */
  ariaTools: boolean;
  /** Longest media retention the merchant may set; basic is fixed at this value. */
  maxMediaRetentionDays: number;
  /** Media retention can be changed from the default. */
  customMediaRetention: boolean;
}

export interface InstancePlanStatus {
  appId: string;
  instanceId: string;
  plan: PlanTier;
  isFree: boolean;
  freeTrialAvailable: boolean;
  upgradeUrl: string;
  entitlements: PlanEntitlements;
}

export type PlanAction =
  | 'create_rule'
  | 'rule_scope_all'
  | 'rule_scope_category'
  | 'create_resale'
  | 'export_csv'
  | 'advanced_styling'
  | 'revive_job'
  | 'extended_reports'
  | 'ship_in'
  | 'media_uploads'
  | 'revised_offer'
  | 'custom_sender'
  | 'aria_tools';

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  basic: {
    maxRules: 1,
    allowAllProductsScope: false,
    allowCategoryScope: false,
    maxProductsPerRule: 1,
    resaleDrafts: false,
    csvExport: false,
    advancedStyling: true,
    expeditedRetry: false,
    maxReportDays: 7,
    maxRequestsPerMonth: 1,
    shipIn: false,
    mediaUploads: false,
    revisedOffers: false,
    customerEmails: ['submitted', 'approved', 'rejected', 'credit_issued'],
    merchantEmails: ['submitted'],
    maxStaffRecipients: 1,
    customSender: false,
    ariaTools: false,
    maxMediaRetentionDays: 30,
    customMediaRetention: false,
  },
  pro: {
    maxRules: 10,
    allowAllProductsScope: true,
    allowCategoryScope: true,
    maxProductsPerRule: 500,
    resaleDrafts: true,
    csvExport: true,
    advancedStyling: true,
    expeditedRetry: true,
    maxReportDays: 60,
    maxRequestsPerMonth: 100,
    shipIn: true,
    mediaUploads: true,
    revisedOffers: true,
    customerEmails: 'all',
    merchantEmails: 'all',
    maxStaffRecipients: 5,
    customSender: true,
    ariaTools: false,
    maxMediaRetentionDays: 90,
    customMediaRetention: true,
  },
  business: {
    maxRules: Infinity,
    allowAllProductsScope: true,
    allowCategoryScope: true,
    maxProductsPerRule: Infinity,
    resaleDrafts: true,
    csvExport: true,
    advancedStyling: true,
    expeditedRetry: true,
    maxReportDays: 365,
    maxRequestsPerMonth: Infinity,
    shipIn: true,
    mediaUploads: true,
    revisedOffers: true,
    customerEmails: 'all',
    merchantEmails: 'all',
    maxStaffRecipients: 20,
    customSender: true,
    ariaTools: true,
    maxMediaRetentionDays: 365,
    customMediaRetention: true,
  },
};

/** Normalizes plan string to lowercase 'basic' | 'pro' | 'business' (case-insensitive). */
export function normalizePlanTier(raw?: string | null): PlanTier {
  if (!raw) return 'basic';
  const clean = String(raw).trim().toLowerCase();
  if (clean.includes('business')) return 'business';
  if (clean.includes('pro')) return 'pro';
  return 'basic';
}

export function getPlanEntitlements(tier?: string | null): PlanEntitlements {
  const normalized = normalizePlanTier(tier);
  return PLAN_ENTITLEMENTS[normalized];
}

export function canPerformAction(tier: string | null | undefined, action: PlanAction, currentCount = 0): boolean {
  const normalized = normalizePlanTier(tier);
  const e = getPlanEntitlements(normalized);
  switch (action) {
    case 'create_rule':
      return currentCount < e.maxRules;
    case 'rule_scope_all':
      return e.allowAllProductsScope;
    case 'rule_scope_category':
      return e.allowCategoryScope;
    case 'create_resale':
      return e.resaleDrafts;
    case 'export_csv':
      return e.csvExport;
    case 'advanced_styling':
      return e.advancedStyling;
    case 'revive_job':
      return e.expeditedRetry;
    case 'extended_reports':
      return e.maxReportDays >= 30;
    case 'ship_in':
      return e.shipIn;
    case 'media_uploads':
      return e.mediaUploads;
    case 'revised_offer':
      return e.revisedOffers;
    case 'custom_sender':
      return e.customSender;
    case 'aria_tools':
      return e.ariaTools;
    default:
      return false;
  }
}

export function getUpgradeUrl(appId: string = APP_ID, instanceId?: string): string {
  if (instanceId) {
    return `https://www.wix.com/apps/upgrade/${appId}?appInstanceId=${encodeURIComponent(instanceId)}`;
  }
  return `https://www.wix.com/apps/upgrade/${appId}`;
}

export function emailAllowed(e: PlanEntitlements, kind: 'customer' | 'merchant', event: string): boolean {
  const allowed = kind === 'customer' ? e.customerEmails : e.merchantEmails;
  return allowed === 'all' || (allowed as readonly string[]).includes(event);
}

/**
 * Settings as they take effect on a plan. Stored settings are never rewritten, so upgrading
 * restores whatever the merchant set before; everything that reads settings at runtime
 * (form, submission, emails, retention) goes through this.
 */
export function applyPlanToSettings(settings: Settings, e: PlanEntitlements): Settings {
  const shipIn = e.shipIn && settings.handoff.shipIn.enabled;
  const toggles = <T extends Record<string, boolean>>(kind: 'customer' | 'merchant', prefs: T): T =>
    Object.fromEntries(Object.entries(prefs).map(([k, on]) => [k, on && emailAllowed(e, kind, k)])) as T;
  return {
    ...settings,
    handoff: {
      // At least one hand-off must stay available, so drop-off takes over when ship-in is the only one.
      dropOff: { ...settings.handoff.dropOff, enabled: settings.handoff.dropOff.enabled || !shipIn },
      shipIn: { ...settings.handoff.shipIn, enabled: shipIn },
    },
    mediaRetentionDays: e.customMediaRetention ? Math.min(settings.mediaRetentionDays, e.maxMediaRetentionDays) : e.maxMediaRetentionDays,
    notifications: {
      ...settings.notifications,
      customer: toggles('customer', settings.notifications.customer),
      merchant: toggles('merchant', settings.notifications.merchant),
      staffUserIds: settings.notifications.staffUserIds.slice(0, e.maxStaffRecipients),
      senderName: e.customSender ? settings.notifications.senderName : '',
      replyToEmail: e.customSender ? settings.notifications.replyToEmail : '',
    },
  };
}

/** Start of the current calendar month in UTC, the window for maxRequestsPerMonth. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
