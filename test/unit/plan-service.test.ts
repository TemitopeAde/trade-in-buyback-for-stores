import { describe, expect, it } from 'vitest';
import { PlanService } from '../../src/server/services/PlanService';

describe('PlanService dev plan', () => {
  it('gives every instance the dev plan without asking Wix', async () => {
    const svc = new PlanService({ devPlan: 'business' });
    expect((await svc.entitlements('any-instance')).maxRequestsPerMonth).toBe(Infinity);
    expect(await svc.getPlanStatus('any-instance')).toMatchObject({ plan: 'business', isFree: false });
  });

  it('lets a per-instance mock plan override the dev plan', async () => {
    const svc = new PlanService({ devPlan: 'business' });
    svc.setMockPlan('inst-1', 'basic');
    expect((await svc.entitlements('inst-1')).maxRequestsPerMonth).toBe(1);
  });
});
