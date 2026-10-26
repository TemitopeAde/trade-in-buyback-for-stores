import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as saveRuleRoute } from '../../src/pages/api/admin/rule-save';
import { planService, rules } from '../../src/server/container';
import type { RequestContext } from '../../src/server/context';
import type { RuleInput } from '../../src/lib/schemas/domain';
import { AppError } from '../../src/server/errors';

const { memoryRepo } = await vi.hoisted(async () => {
  const { MemoryRepo } = await import('../support/memoryRepo');
  return { memoryRepo: new MemoryRepo() };
});

vi.mock('../../src/server/wixDataRepo', () => ({
  wixDataRepo: memoryRepo,
}));

const INSTANCE = 'inst-plan-test';


// Mock auth so getRequestContext returns merchant caller
vi.mock('@wix/essentials', () => ({
  auth: {
    getTokenInfo: vi.fn(async () => ({
      active: true,
      subjectType: 'USER',
      subjectId: 'merchant-1',
      siteId: 'site-1',
      instanceId: INSTANCE,
    })),
    elevate: (fn: any) => fn,
  },
}));

function createFakeApi(body: unknown): any {
  return {
    request: new Request('http://localhost/api/admin/rule-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

describe('Plan-based Rule Enforcement', () => {
  beforeEach(async () => {
    // Clear rules for this instance
    const existing = await rules.list(INSTANCE);
    for (const r of existing) {
      await rules.remove(INSTANCE, r._id);
    }
    planService.clearMockPlan(INSTANCE);
  });

  describe('Basic Plan Restrictions', () => {
    beforeEach(() => {
      planService.setMockPlan(INSTANCE, 'basic');
    });

    it('rejects "all" products scope on basic plan', async () => {
      const rule: RuleInput = {
        name: 'All products rule',
        scope: 'all',
        productIds: [],
        payoutPercentage: 50,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('forbidden');
    });

    it('rejects "category" scope on basic plan', async () => {
      const rule: RuleInput = {
        name: 'Category rule',
        scope: 'category',
        categoryId: 'cat-1',
        productIds: [],
        payoutPercentage: 50,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('forbidden');
    });

    it('rejects product scope with multiple products on basic plan', async () => {
      const rule: RuleInput = {
        name: 'Multi-product rule',
        scope: 'product',
        productIds: ['prod-1', 'prod-2'],
        payoutPercentage: 50,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('forbidden');
    });

    it('allows product scope with exactly 1 product on basic plan', async () => {
      const rule: RuleInput = {
        name: 'Single product rule',
        scope: 'product',
        productIds: ['prod-single'],
        payoutPercentage: 50,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(200);
      const saved = await res.json();
      expect(saved.name).toBe('Single product rule');
      expect(saved.productIds).toEqual(['prod-single']);
    });

    it('prevents creating more than 1 rule on basic plan', async () => {
      const rule1: RuleInput = {
        name: 'First Rule',
        scope: 'product',
        productIds: ['prod-1'],
        payoutPercentage: 50,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };
      const rule2: RuleInput = {
        name: 'Second Rule',
        scope: 'product',
        productIds: ['prod-2'],
        payoutPercentage: 40,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res1 = await saveRuleRoute(createFakeApi({ rule: rule1 }));
      expect(res1.status).toBe(200);

      const res2 = await saveRuleRoute(createFakeApi({ rule: rule2 }));
      expect(res2.status).toBe(403);
      const json = await res2.json();
      expect(json.error.code).toBe('forbidden');
    });
  });

  describe('Pro and Business Plan Permissions', () => {
    it('allows multiple products and all products scope on pro plan (case-insensitive "PRO")', async () => {
      planService.setMockPlan(INSTANCE, 'PRO' as any);

      const rule: RuleInput = {
        name: 'Pro Rule All Products',
        scope: 'all',
        productIds: [],
        payoutPercentage: 60,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(200);
      const saved = await res.json();
      expect(saved.name).toBe('Pro Rule All Products');
      expect(saved.scope).toBe('all');
    });

    it('allows unrestricted rules on business plan (case-insensitive "BUSINESS")', async () => {
      planService.setMockPlan(INSTANCE, 'BuSiNeSs' as any);

      const rule: RuleInput = {
        name: 'Business Multi-Product Rule',
        scope: 'product',
        productIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
        payoutPercentage: 75,
        conditionQuestions: [],
        photoMinimum: 1,
        videoMode: 'off',
        videoMaxSeconds: 60,
        priority: 0,
        enabled: true,
      };

      const res = await saveRuleRoute(createFakeApi({ rule }));
      expect(res.status).toBe(200);
      const saved = await res.json();
      expect(saved.name).toBe('Business Multi-Product Rule');
      expect(saved.productIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    });
  });
});
