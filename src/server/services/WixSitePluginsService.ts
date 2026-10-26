import { auth } from '@wix/essentials';
import { plugins } from '@wix/site-plugins';
import type { PluginPlacementStatus } from '../../lib/schemas/admin';

export type GetPlacementStatusFn = () => Promise<{
  placementStatuses?: { pluginId?: string | null; placedInSlot?: boolean | null }[];
}>;

/**
 * Service to query site plugin placement statuses via Wix SDK (@wix/site-plugins).
 * Requires permission PLUGINS.PLACEMENT_STATUSES_READ (SCOPE.SITE-PLUGIN.READ-PLACEMENT-STATUS).
 */
export class WixSitePluginsService {
  private readonly getStatusFn: GetPlacementStatusFn;

  constructor(customFetcher?: GetPlacementStatusFn) {
    this.getStatusFn = customFetcher ?? auth.elevate(plugins.getPlacementStatus);
  }

  async getPlacementStatus(): Promise<PluginPlacementStatus[]> {
    try {
      const res = await this.getStatusFn();
      return (res?.placementStatuses ?? []).map((s) => ({
        pluginId: s.pluginId ?? '',
        placedInSlot: Boolean(s.placedInSlot),
      }));
    } catch {
      return [];
    }
  }

  async isPluginPlaced(pluginId: string): Promise<boolean> {
    const statuses = await this.getPlacementStatus();
    const hit = statuses.find((s) => s.pluginId === pluginId);
    return Boolean(hit?.placedInSlot);
  }
}
