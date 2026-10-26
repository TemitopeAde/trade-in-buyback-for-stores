import { describe, expect, it } from 'vitest';
import {
  APP_ID,
  canPerformAction,
  getPlanEntitlements,
  getUpgradeUrl,
  normalizePlanTier,
  PLAN_ENTITLEMENTS,
} from '../../src/lib/plans';

describe('plans and entitlements', () => {
  describe('normalizePlanTier (case-insensitivity)', () => {
    it('normalizes basic in any casing', () => {
      expect(normalizePlanTier('basic')).toBe('basic');
      expect(normalizePlanTier('BASIC')).toBe('basic');
      expect(normalizePlanTier('Basic')).toBe('basic');
      expect(normalizePlanTier('  BaSiC  ')).toBe('basic');
      expect(normalizePlanTier('Basic Plan')).toBe('basic');
      expect(normalizePlanTier(null)).toBe('basic');
      expect(normalizePlanTier(undefined)).toBe('basic');
    });

    it('normalizes pro in any casing', () => {
      expect(normalizePlanTier('pro')).toBe('pro');
      expect(normalizePlanTier('PRO')).toBe('pro');
      expect(normalizePlanTier('Pro')).toBe('pro');
      expect(normalizePlanTier('  pRo Plan  ')).toBe('pro');
      expect(normalizePlanTier('trade-in PRO monthly')).toBe('pro');
    });

    it('normalizes business in any casing', () => {
      expect(normalizePlanTier('business')).toBe('business');
      expect(normalizePlanTier('BUSINESS')).toBe('business');
      expect(normalizePlanTier('Business')).toBe('business');
      expect(normalizePlanTier('  BuSiNeSs UnLiMiTeD  ')).toBe('business');
    });
  });

  describe('getPlanEntitlements', () => {
    it('returns basic entitlements with single-product limitation', () => {
      const e = getPlanEntitlements('BASIC');
      expect(e.maxRules).toBe(1);
      expect(e.allowAllProductsScope).toBe(false);
      expect(e.allowCategoryScope).toBe(false);
      expect(e.maxProductsPerRule).toBe(1);
      expect(e.resaleDrafts).toBe(false);
      expect(e.csvExport).toBe(false);
      expect(e.advancedStyling).toBe(false);
      expect(e.expeditedRetry).toBe(false);
      expect(e.maxReportDays).toBe(14);
    });

    it('returns pro entitlements with expanded limits', () => {
      const e = getPlanEntitlements('PRO');
      expect(e.maxRules).toBe(10);
      expect(e.allowAllProductsScope).toBe(true);
      expect(e.allowCategoryScope).toBe(true);
      expect(e.maxProductsPerRule).toBe(500);
      expect(e.resaleDrafts).toBe(true);
      expect(e.csvExport).toBe(true);
      expect(e.advancedStyling).toBe(true);
      expect(e.expeditedRetry).toBe(true);
      expect(e.maxReportDays).toBe(60);
    });

    it('returns business entitlements with unrestricted access', () => {
      const e = getPlanEntitlements('BUSINESS');
      expect(e.maxRules).toBe(Infinity);
      expect(e.allowAllProductsScope).toBe(true);
      expect(e.allowCategoryScope).toBe(true);
      expect(e.maxProductsPerRule).toBe(Infinity);
      expect(e.resaleDrafts).toBe(true);
      expect(e.csvExport).toBe(true);
      expect(e.advancedStyling).toBe(true);
      expect(e.expeditedRetry).toBe(true);
      expect(e.maxReportDays).toBe(365);
    });
  });

  describe('canPerformAction', () => {
    it('evaluates rule creation by current rule count', () => {
      expect(canPerformAction('basic', 'create_rule', 0)).toBe(true);
      expect(canPerformAction('basic', 'create_rule', 1)).toBe(false);
      expect(canPerformAction('pro', 'create_rule', 5)).toBe(true);
      expect(canPerformAction('pro', 'create_rule', 10)).toBe(false);
      expect(canPerformAction('business', 'create_rule', 999)).toBe(true);
    });

    it('evaluates rule scopes', () => {
      expect(canPerformAction('basic', 'rule_scope_all')).toBe(false);
      expect(canPerformAction('basic', 'rule_scope_category')).toBe(false);
      expect(canPerformAction('pro', 'rule_scope_all')).toBe(true);
      expect(canPerformAction('pro', 'rule_scope_category')).toBe(true);
      expect(canPerformAction('business', 'rule_scope_all')).toBe(true);
    });

    it('evaluates feature permissions', () => {
      expect(canPerformAction('basic', 'create_resale')).toBe(false);
      expect(canPerformAction('pro', 'create_resale')).toBe(true);
      expect(canPerformAction('basic', 'export_csv')).toBe(false);
      expect(canPerformAction('pro', 'export_csv')).toBe(true);
      expect(canPerformAction('basic', 'advanced_styling')).toBe(false);
      expect(canPerformAction('business', 'advanced_styling')).toBe(true);
    });
  });

  describe('getUpgradeUrl', () => {
    it('builds standard Wix App Market upgrade URL with appId and instanceId', () => {
      expect(getUpgradeUrl(APP_ID, 'inst-123')).toBe(`https://www.wix.com/apps/upgrade/${APP_ID}?appInstanceId=inst-123`);
      expect(getUpgradeUrl('custom-app', 'inst-456')).toBe('https://www.wix.com/apps/upgrade/custom-app?appInstanceId=inst-456');
    });

    it('builds base upgrade URL without instanceId if omitted', () => {
      expect(getUpgradeUrl(APP_ID)).toBe(`https://www.wix.com/apps/upgrade/${APP_ID}`);
    });
  });
});
