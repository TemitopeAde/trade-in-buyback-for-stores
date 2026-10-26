import { describe, expect, it } from 'vitest';
import { WixSitePluginsService } from '../../src/server/services/WixSitePluginsService';
import { CTA_PLUGIN_ID } from '../../src/lib/schemas/admin';

describe('WixSitePluginsService', () => {
  it('returns placement statuses from the Wix site plugins API', async () => {
    const mockFetcher = async () => ({
      placementStatuses: [
        { pluginId: CTA_PLUGIN_ID, placedInSlot: true },
        { pluginId: 'other-plugin-id', placedInSlot: false },
      ],
    });

    const svc = new WixSitePluginsService(mockFetcher);
    const statuses = await svc.getPlacementStatus();

    expect(statuses).toEqual([
      { pluginId: CTA_PLUGIN_ID, placedInSlot: true },
      { pluginId: 'other-plugin-id', placedInSlot: false },
    ]);
  });

  it('correctly checks whether a specific plugin is placed in a slot', async () => {
    const mockFetcher = async () => ({
      placementStatuses: [
        { pluginId: CTA_PLUGIN_ID, placedInSlot: true },
        { pluginId: 'unplaced-id', placedInSlot: false },
      ],
    });

    const svc = new WixSitePluginsService(mockFetcher);

    expect(await svc.isPluginPlaced(CTA_PLUGIN_ID)).toBe(true);
    expect(await svc.isPluginPlaced('unplaced-id')).toBe(false);
    expect(await svc.isPluginPlaced('non-existent-id')).toBe(false);
  });

  it('handles API errors gracefully without throwing', async () => {
    const failingFetcher = async () => {
      throw new Error('PERMISSION_DENIED');
    };

    const svc = new WixSitePluginsService(failingFetcher);
    const statuses = await svc.getPlacementStatus();

    expect(statuses).toEqual([]);
    expect(await svc.isPluginPlaced(CTA_PLUGIN_ID)).toBe(false);
  });

  it('handles empty or missing placementStatuses gracefully', async () => {
    const emptyFetcher = async () => ({});

    const svc = new WixSitePluginsService(emptyFetcher as any);
    const statuses = await svc.getPlacementStatus();

    expect(statuses).toEqual([]);
    expect(await svc.isPluginPlaced(CTA_PLUGIN_ID)).toBe(false);
  });
});
