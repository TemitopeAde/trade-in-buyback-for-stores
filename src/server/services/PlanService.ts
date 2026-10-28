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

import { AppError } from '../errors';

const CACHE_MS = 60_000;

/** What the rest of the server needs from the plan; tests pass a fixed implementation. */
export type PlanLimits = { entitlements(instanceId: string): Promise<PlanEntitlements> };

export class PlanService implements PlanLimits {
  private readonly mockPlans = new Map<string, PlanTier>();
  private readonly cache = new Map<string, { plan: PlanTier; at: number }>();

  /** Used by tests to override plan tier for an instance. */
  setMockPlan(instanceId: string, plan: PlanTier): void {
    this.mockPlans.set(instanceId, normalizePlanTier(plan));
  }

  clearMockPlan(instanceId: string): void {
    this.mockPlans.delete(instanceId);
  }

  /**
   * Entitlements for enforcement. Cached briefly so a burst of requests or outbox events makes
   * one Wix call. When the lookup fails it uses the last known plan, and with none it throws
   * (retryable) rather than silently treating a paying site as basic.
   */
  async entitlements(instanceId: string): Promise<PlanEntitlements> {
    const mock = this.mockPlans.get(instanceId);
    if (mock) return getPlanEntitlements(mock);
    const hit = this.cache.get(instanceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return getPlanEntitlements(hit.plan);
    try {
      return getPlanEntitlements((await this.fetchInstance(instanceId)).plan);
    } catch {
      if (hit) return getPlanEntitlements(hit.plan);
      throw new AppError('unavailable', 'plan lookup failed');
    }
  }

  private async fetchInstance(instanceId: string) {
    const elevatedGet = auth.elevate(appInstances.getAppInstance);
    const res = await elevatedGet();
    const instance = res?.instance;
    const isFree = instance?.isFree !== false;
    const plan: PlanTier = isFree ? 'basic' : normalizePlanTier(instance?.billing?.packageName ?? 'pro');
    this.cache.set(instanceId, { plan, at: Date.now() });
    return { instance, isFree, plan };
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
      const { instance, isFree, plan } = await this.fetchInstance(instanceId);
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
