import { availableActions, type TradeInStatus } from '../../lib/lifecycle';
import {
  MERCHANT_ACTIONS,
  STATUS_GROUPS,
  type AdminActionRequest,
  type AdminListRequest,
  type AdminListResponse,
  type AdminTimelineEntry,
  type AdminTradeInDetail,
  type AdminTradeInRow,
  type MerchantAction,
  type OverviewResponse,
} from '../../lib/schemas/admin';
import { COLLECTIONS } from '../collections';
import { randomToken } from '../crypto';
import { AppError } from '../errors';
import type { FindOptions, Repo, Where } from '../repo';
import type { Actor, TradeInDoc, TradeInEventDoc } from '../types';
import type { RulesService } from './RulesService';
import type { SettingsService } from './SettingsService';
import type { TradeInLifecycleService } from './TradeInLifecycleService';
import type { TradeInMediaService } from './TradeInMediaService';
import type { PlanLimits } from './PlanService';

// Dashboard-side workflows. Callers have already passed requireMerchant(); every query and
// mutation is scoped to the caller's instance.

type Deps = {
  repo: Repo;
  lifecycle: TradeInLifecycleService;
  media: TradeInMediaService;
  rules: RulesService;
  settings: SettingsService;
  catalogVersion: (instanceId: string) => Promise<string>;
  giftCardsAvailable?: () => Promise<boolean>;
  pluginPlaced?: () => Promise<boolean>;
  /** Plan limits (revised offers). Omitted = unlimited. */
  plan?: PlanLimits;
  now?: () => Date;
};

const SORTS: Record<AdminListRequest['sort'], FindOptions['sort']> = {
  created_desc: [{ field: '_createdDate', order: 'desc' }],
  created_asc: [{ field: '_createdDate', order: 'asc' }],
  value_desc: [{ field: 'estimatedValueMinor', order: 'desc' }],
  value_asc: [{ field: 'estimatedValueMinor', order: 'asc' }],
};

export class MerchantService {
  private readonly now: () => Date;
  constructor(private readonly d: Deps) {
    this.now = d.now ?? (() => new Date());
  }

  async list(instanceId: string, req: AdminListRequest): Promise<AdminListResponse> {
    const where: Where = { instanceId };
    if (req.status) where.status = req.status;
    else if (req.statusGroup) where.status = { $in: STATUS_GROUPS[req.statusGroup] };
    if (req.categoryId) where.categoryId = req.categoryId;
    const from = req.from ? new Date(`${req.from}T00:00:00Z`) : undefined;
    const toExclusive = req.to ? new Date(new Date(`${req.to}T00:00:00Z`).getTime() + 86_400_000) : undefined;
    if (from && toExclusive) where._createdDate = { $between: [from, toExclusive] };
    else if (from) where._createdDate = { $gte: from };
    else if (toExclusive) where._createdDate = { $lt: toExclusive };
    const q = req.q.trim();
    if (q) {
      // Reference lookups are exact; otherwise search customer/product fields.
      where.$or = /^TI-/i.test(q)
        ? [{ reference: q.toUpperCase() }]
        : [{ customerEmail: { $contains: q.toLowerCase() } }, { customerName: { $contains: q } }, { productTitle: { $contains: q } }];
    }
    const res = await this.d.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, where, {
      sort: SORTS[req.sort],
      limit: req.pageSize,
      skip: req.page * req.pageSize,
      withTotal: true,
    });
    return { items: res.items.map(toRow), total: res.total ?? res.items.length, page: req.page, pageSize: req.pageSize };
  }

  async detail(instanceId: string, tradeInId: string): Promise<AdminTradeInDetail> {
    const doc = await this.d.lifecycle.load(instanceId, tradeInId);
    const [events, media, labels] = await Promise.all([
      this.d.lifecycle.timeline(instanceId, tradeInId),
      this.d.media.viewable(instanceId, tradeInId),
      this.answerLabels(instanceId, doc),
    ]);
    return {
      ...toRow(doc),
      revision: doc.revision,
      customerPhone: doc.customerPhone,
      memberId: doc.memberId,
      orderId: doc.orderId,
      productId: doc.productId,
      productImageUrl: doc.productSnapshot?.imageUrl,
      conditionAnswers: labels,
      offerBreakdown: doc.offerBreakdown,
      revisedValueMinor: doc.revisedValueMinor,
      revisedOfferReason: doc.revisedOfferReason,
      revisedOfferExpiresAt: iso(doc.revisedOfferExpiresAt),
      handoffMethod: doc.handoffMethod,
      trackingNumber: doc.trackingNumber,
      rejectionReason: doc.rejectionReason,
      inspectionNotes: doc.inspectionNotes,
      returnStatus: doc.returnStatus,
      giftCardId: doc.giftCardId,
      giftCardIssuedAt: iso(doc.giftCardIssuedAt),
      giftCardEmailStatus: doc.giftCardEmailStatus,
      resaleProductId: doc.resaleProductId,
      resaleDraftStatus: doc.resaleDraftStatus,
      notes: (doc.internalNotes ?? []).map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt })),
      media: media.map((m) => ({ mediaId: m.mediaId, kind: m.kind, status: m.status, url: m.url })),
      timeline: events.map(toTimeline),
      actions: merchantActions(doc, await this.revisedOffersAllowed(instanceId)),
    };
  }

  private async revisedOffersAllowed(instanceId: string): Promise<boolean> {
    return !this.d.plan || (await this.d.plan.entitlements(instanceId)).revisedOffers;
  }

  /** Validates action-specific input and applies the transition with its field changes. */
  async act(instanceId: string, actor: Actor, req: AdminActionRequest): Promise<AdminTradeInDetail> {
    if (req.action === 'send_revised_offer' && !(await this.revisedOffersAllowed(instanceId))) {
      throw new AppError('forbidden', 'revised_offer_requires_pro');
    }
    const doc = await this.d.lifecycle.load(instanceId, req.tradeInId);
    const settings = await this.d.settings.get(instanceId);
    const patch: Partial<TradeInDoc> = {};
    const reason = req.reason?.trim();

    switch (req.action) {
      case 'reject':
      case 'reject_after_inspection':
        if (!reason) throw new AppError('bad_request', 'reason required', { reason: 'required' });
        patch.rejectionReason = reason;
        if (req.action === 'reject_after_inspection') {
          patch.returnStatus = 'pending';
          patch.inspectionNotes = req.inspectionNotes ?? doc.inspectionNotes;
        }
        break;
      case 'confirm_value':
        // Credit equals the estimate recorded at submission (server-computed, never client input).
        patch.finalValueMinor = doc.estimatedValueMinor;
        patch.inspectionNotes = req.inspectionNotes ?? doc.inspectionNotes;
        break;
      case 'send_revised_offer': {
        const amount = req.revisedValueMinor;
        if (!amount) throw new AppError('bad_request', 'amount required', { revisedValueMinor: 'required' });
        if (!reason) throw new AppError('bad_request', 'reason required', { reason: 'required' });
        if (amount === doc.estimatedValueMinor) throw new AppError('bad_request', 'same as estimate', { revisedValueMinor: 'same_as_estimate' });
        if (amount < settings.credit.minimumCreditMinor) throw new AppError('bad_request', 'below minimum', { revisedValueMinor: 'below_minimum' });
        // Guard against fat-finger amounts: a revision may not exceed twice the original estimate.
        if (amount > doc.estimatedValueMinor * 2) throw new AppError('bad_request', 'too high', { revisedValueMinor: 'too_high' });
        patch.revisedValueMinor = amount;
        patch.revisedOfferReason = reason;
        patch.revisedOfferExpiresAt = new Date(this.now().getTime() + settings.revisedOfferExpiryDays * 86_400_000);
        patch.inspectionNotes = req.inspectionNotes ?? doc.inspectionNotes;
        break;
      }
      case 'accept_revised_offer':
        if (doc.revisedValueMinor === undefined) throw new AppError('invalid_transition', 'no revised offer');
        patch.finalValueMinor = doc.revisedValueMinor;
        break;
      case 'decline_revised_offer':
        patch.returnStatus = 'pending';
        break;
      case 'mark_returned':
        patch.returnStatus = 'returned';
        break;
      case 'mark_in_transit':
        if (req.trackingNumber) patch.trackingNumber = req.trackingNumber;
        break;
    }

    await this.d.lifecycle.transition({
      instanceId,
      tradeInId: doc._id,
      action: req.action,
      actor,
      expectedRevision: req.expectedRevision,
      idempotencyKey: req.idempotencyKey,
      reason,
      patch,
    });
    return this.detail(instanceId, doc._id);
  }

  async addNote(instanceId: string, actor: Actor, tradeInId: string, text: string): Promise<AdminTradeInDetail> {
    await this.d.lifecycle.mutate({
      instanceId,
      tradeInId,
      actor,
      eventType: 'note.added',
      retries: 2,
      change: (c) => ({
        internalNotes: [...(c.internalNotes ?? []), { id: randomToken(9), authorId: actor.id ?? '', text, createdAt: this.now().toISOString() }].slice(-200),
      }),
    });
    return this.detail(instanceId, tradeInId);
  }

  async overview(instanceId: string): Promise<Omit<OverviewResponse, 'usage'>> {
    const groups = Object.keys(STATUS_GROUPS) as (keyof typeof STATUS_GROUPS)[];
    const counts = Object.fromEntries(
      await Promise.all(groups.map(async (g) => [g, await this.d.repo.count(COLLECTIONS.tradeIns, { instanceId, status: { $in: STATUS_GROUPS[g] } })] as const)),
    ) as OverviewResponse['counts'];
    const issued = await this.d.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId, giftCardStatus: 'issued' }, { limit: 1000 });
    const creditIssuedMinorByCurrency: Record<string, number> = {};
    for (const d of issued.items) creditIssuedMinorByCurrency[d.currency] = (creditIssuedMinorByCurrency[d.currency] ?? 0) + (d.finalValueMinor ?? 0);
    const recent = await this.d.repo.find<TradeInEventDoc>(COLLECTIONS.events, { instanceId }, { sort: [{ field: '_createdDate', order: 'desc' }], limit: 10 });
    const settings = await this.d.settings.get(instanceId);
    const catalogVersion = await this.d.catalogVersion(instanceId).catch(() => 'UNKNOWN');
    // Wix gift card emails fail without a premium plan and there's no API to check that up front,
    // so the latest attempt is the signal.
    const lastEmail = settings.credit.sendGiftCardEmail
      ? (await this.d.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId, giftCardEmailStatus: { $in: ['sent', 'failed'] } }, { sort: [{ field: 'giftCardEmailAt', order: 'desc' }], limit: 1 })).items[0]
      : undefined;
    return {
      counts,
      creditIssuedMinorByCurrency,
      recent: recent.items.map(toTimeline),
      setup: {
        storesInstalled: catalogVersion === 'V1_CATALOG' || catalogVersion === 'V3_CATALOG',
        catalogVersion,
        hasRules: (await this.d.rules.listEnabled(instanceId)).length > 0,
        settingsSaved: await this.d.settings.exists(instanceId),
        formPageConfigured: !!settings.pages.formPageUrl,
        statusPageConfigured: !!settings.pages.statusPageUrl,
        pluginPlaced: this.d.pluginPlaced ? await this.d.pluginPlaced().catch(() => false) : undefined,
        giftCardsAvailable: this.d.giftCardsAvailable ? await this.d.giftCardsAvailable().catch(() => false) : undefined,
        giftCardEmailWorking: lastEmail ? lastEmail.giftCardEmailStatus === 'sent' : undefined,
        emailConfigured: settings.notifications.staffUserIds.length > 0,
      },
    };
  }

  private async answerLabels(instanceId: string, doc: TradeInDoc) {
    // Labels come from the rule version the offer used when it still exists; IDs otherwise.
    const rule = await this.d.rules.get(instanceId, doc.offerBreakdown?.ruleId ?? '').catch(() => undefined);
    return Object.entries(doc.conditionAnswers ?? {}).map(([qid, oid]) => {
      const q = rule?.conditionQuestions.find((x) => x.id === qid);
      return { questionId: qid, optionId: oid, question: q?.label ?? qid, answer: q?.options.find((o) => o.id === oid)?.label ?? oid };
    });
  }
}

function iso(d: unknown): string | undefined {
  return d ? new Date(d as string).toISOString() : undefined;
}

function toRow(d: TradeInDoc): AdminTradeInRow {
  return {
    id: d._id,
    reference: d.reference,
    customerName: d.customerName,
    customerEmail: d.customerEmail,
    productTitle: d.productTitle,
    categoryId: d.categoryId,
    estimatedValueMinor: d.estimatedValueMinor,
    finalValueMinor: d.finalValueMinor,
    currency: d.currency,
    status: d.status,
    giftCardStatus: d.giftCardStatus,
    createdAt: iso(d._createdDate) ?? '',
  };
}

function toTimeline(e: TradeInEventDoc): AdminTimelineEntry {
  return {
    id: e._id,
    eventType: e.eventType,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actorType: e.actorType,
    reason: e.reason,
    at: iso(e._createdDate) ?? '',
    metadata: e.metadataSanitized,
  };
}

export function merchantActions(doc: { status: TradeInStatus; handoffMethod: string; revisedValueMinor?: number }, revisedOffers = true): MerchantAction[] {
  return availableActions(doc.status, 'merchant').filter((a): a is MerchantAction =>
    (MERCHANT_ACTIONS as readonly string[]).includes(a) && (a !== 'mark_in_transit' || doc.handoffMethod === 'ship_in') && (a !== 'send_revised_offer' || revisedOffers),
  );
}
