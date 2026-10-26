import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';
import {
  APP_ID,
  getPlanEntitlements,
  getUpgradeUrl,
  normalizePlanTier,
  type InstancePlanStatus,
  type PlanEntitlements,
  type PlanTier,
} from '../../lib/plans';

export class PlanService {
  private readonly mockPlans = new Map<string, PlanTier>();

  /** Used by tests to override plan tier for an instance. */
  setMockPlan(instanceId: string, plan: PlanTier): void {
    this.mockPlans.set(instanceId, normalizePlanTier(plan));
  }

  clearMockPlan(instanceId: string): void {
    this.mockPlans.delete(instanceId);
  }

  async getPlanStatus(instanceId: string): Promise<InstancePlanStatus> {
    const mock = this.mockPlans.get(instanceId);
    if (mock) {
      const plan = normalizePlanTier(mock);
      const isFree = plan === 'basic';
      return {
        appId: APP_ID,
        instanceId,
        plan,
        isFree,
        freeTrialAvailable: isFree,
        upgradeUrl: getUpgradeUrl(APP_ID, instanceId),
        entitlements: getPlanEntitlements(plan),
      };
    }

    try {
      const elevatedGet = auth.elevate(appInstances.getAppInstance);
      const res = await elevatedGet();
      const instance = res?.instance;

      const isFree = instance?.isFree !== false;
      const rawPackage = instance?.billing?.packageName;
      const plan: PlanTier = isFree ? 'basic' : normalizePlanTier(rawPackage ?? 'pro');
      const freeTrialAvailable = instance?.freeTrialAvailable ?? isFree;

      return {
        appId: APP_ID,
        instanceId: instance?.instanceId || instanceId,
        plan,
        isFree,
        freeTrialAvailable,
        upgradeUrl: getUpgradeUrl(APP_ID, instance?.instanceId || instanceId),
        entitlements: getPlanEntitlements(plan),
      };
    } catch {
      // In offline/test/mock environments without Wix API connection, default to 'basic'
      const plan = normalizePlanTier('basic');
      return {
        appId: APP_ID,
        instanceId,
        plan,
        isFree: true,
        freeTrialAvailable: true,
        upgradeUrl: getUpgradeUrl(APP_ID, instanceId),
        entitlements: getPlanEntitlements(plan),
      };
    }
  }
}
