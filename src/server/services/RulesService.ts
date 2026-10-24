import { ruleInputSchema, type Rule } from '../../lib/schemas/domain';
import { COLLECTIONS } from '../collections';
import { AppError } from '../errors';
import type { Doc, Repo } from '../repo';
import { flattenIssues } from './SettingsService';

type RuleDoc = Doc & Rule;

// Merchant-defined eligibility, payout and condition rules. Each save bumps `version`, which is
// stored in every offer breakdown so past estimates remain explainable after edits.

export class RulesService {
  constructor(private readonly repo: Repo) {}

  async list(instanceId: string): Promise<Rule[]> {
    const res = await this.repo.find<RuleDoc>(COLLECTIONS.rules, { instanceId }, { sort: [{ field: 'priority', order: 'desc' }], limit: 200 });
    return res.items.map(toRule);
  }

  async listEnabled(instanceId: string): Promise<Rule[]> {
    return (await this.list(instanceId)).filter((r) => r.enabled);
  }

  async get(instanceId: string, id: string): Promise<Rule> {
    const doc = await this.repo.get<RuleDoc>(COLLECTIONS.rules, id);
    if (!doc || doc.instanceId !== instanceId) throw new AppError('not_found');
    return toRule(doc);
  }

  validate(input: unknown) {
    const parsed = ruleInputSchema.safeParse(input);
    if (!parsed.success) throw new AppError('bad_request', 'invalid rule', flattenIssues(parsed.error.issues));
    const ids = new Set<string>();
    for (const q of parsed.data.conditionQuestions) {
      if (ids.has(q.id)) throw new AppError('bad_request', 'duplicate question id', { conditionQuestions: 'duplicate_id' });
      ids.add(q.id);
      const optionIds = new Set(q.options.map((o) => o.id));
      if (optionIds.size !== q.options.length) throw new AppError('bad_request', 'duplicate option id', { conditionQuestions: 'duplicate_option_id' });
    }
    return parsed.data;
  }

  async create(instanceId: string, input: unknown): Promise<Rule> {
    const data = this.validate(input);
    return toRule(await this.repo.insert<RuleDoc>(COLLECTIONS.rules, { ...data, instanceId, version: 1 } as Omit<RuleDoc, '_id'>));
  }

  async update(instanceId: string, id: string, input: unknown): Promise<Rule> {
    const existing = await this.get(instanceId, id);
    const data = this.validate(input);
    const saved = await this.repo.update<RuleDoc>(COLLECTIONS.rules, { ...(existing as RuleDoc), ...data, _id: id, instanceId, version: existing.version + 1 });
    return toRule(saved);
  }

  async remove(instanceId: string, id: string): Promise<void> {
    await this.get(instanceId, id);
    await this.repo.remove(COLLECTIONS.rules, id);
  }
}

function toRule(doc: RuleDoc): Rule {
  return {
    _id: doc._id,
    instanceId: doc.instanceId,
    version: doc.version ?? 1,
    name: doc.name,
    scope: doc.scope,
    categoryId: doc.categoryId,
    productIds: doc.productIds ?? [],
    payoutPercentage: doc.payoutPercentage,
    conditionQuestions: doc.conditionQuestions ?? [],
    minimumOfferMinor: doc.minimumOfferMinor ?? undefined,
    maximumOfferMinor: doc.maximumOfferMinor ?? undefined,
    photoMinimum: doc.photoMinimum ?? 0,
    videoMode: doc.videoMode ?? 'off',
    videoMaxSeconds: doc.videoMaxSeconds ?? 60,
    priority: doc.priority ?? 0,
    enabled: doc.enabled !== false,
  };
}
