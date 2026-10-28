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
  | 'extended_reports';

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
    maxReportDays: 14,
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
