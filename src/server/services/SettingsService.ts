import { applyPlanToSettings } from '../../lib/plans';
import { defaultSettings, SETTINGS_SCHEMA_VERSION, settingsSchema, type Settings } from '../../lib/schemas/domain';
import { COLLECTIONS } from '../collections';
import { AppError } from '../errors';
import { DuplicateKeyError, type Doc, type Repo } from '../repo';
import type { PlanLimits } from './PlanService';

type SettingsDoc = Doc & { instanceId: string; schemaVersion: number; settings: unknown; disconnected?: boolean };

// One settings record per instance. Missing settings resolve to defaults in memory; nothing
// is written until the merchant saves, so installs never create placeholder records.
// `get` returns settings as they take effect on the site's plan; `getStored` returns what the
// merchant saved, for editing (so a downgrade never erases settings an upgrade would restore).

export class SettingsService {
  constructor(private readonly repo: Repo, private readonly plan?: PlanLimits) {}

  private async doc(instanceId: string): Promise<SettingsDoc | undefined> {
    return (await this.repo.find<SettingsDoc>(COLLECTIONS.settings, { instanceId }, { limit: 1 })).items[0];
  }

  async get(instanceId: string): Promise<Settings> {
    const stored = await this.getStored(instanceId);
    return this.plan ? applyPlanToSettings(stored, await this.plan.entitlements(instanceId)) : stored;
  }

  async getStored(instanceId: string): Promise<Settings> {
    const doc = await this.doc(instanceId);
    if (!doc) return defaultSettings();
    const parsed = settingsSchema.safeParse(doc.settings);
    // A stored record that no longer validates (older schema) falls back field-by-field to defaults.
    return parsed.success ? parsed.data : { ...defaultSettings(), ...(salvage(doc.settings) as Partial<Settings>) };
  }

  async save(instanceId: string, input: unknown): Promise<Settings> {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) throw new AppError('bad_request', 'invalid settings', flattenIssues(parsed.error.issues));
    const existing = await this.doc(instanceId);
    const record = { instanceId, schemaVersion: SETTINGS_SCHEMA_VERSION, settings: parsed.data, disconnected: false };
    if (existing) await this.repo.update<SettingsDoc>(COLLECTIONS.settings, { ...existing, ...record });
    else {
      try {
        await this.repo.insert<SettingsDoc>(COLLECTIONS.settings, record);
      } catch (err) {
        if (!(err instanceof DuplicateKeyError)) throw err;
        const raced = await this.doc(instanceId);
        if (raced) await this.repo.update<SettingsDoc>(COLLECTIONS.settings, { ...raced, ...record });
      }
    }
    return parsed.data;
  }

  async exists(instanceId: string): Promise<boolean> {
    return !!(await this.doc(instanceId));
  }

  async isDisconnected(instanceId: string): Promise<boolean> {
    return !!(await this.doc(instanceId))?.disconnected;
  }

  async setDisconnected(instanceId: string, disconnected: boolean): Promise<void> {
    const existing = await this.doc(instanceId);
    if (existing) await this.repo.update<SettingsDoc>(COLLECTIONS.settings, { ...existing, disconnected });
    else if (disconnected) {
      await this.repo.insert<SettingsDoc>(COLLECTIONS.settings, { instanceId, schemaVersion: SETTINGS_SCHEMA_VERSION, settings: defaultSettings(), disconnected });
    }
  }
}

function salvage(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  const shape = settingsSchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>;
  for (const [key, schema] of Object.entries(shape)) {
    const r = schema.safeParse((raw as Record<string, unknown>)[key]);
    if (r.success) out[key] = r.data;
  }
  return out;
}

export function flattenIssues(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  return Object.fromEntries(issues.slice(0, 20).map((i) => [i.path.map(String).join('.') || '_', i.message]));
}
