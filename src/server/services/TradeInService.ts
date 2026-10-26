import { availableActions, type TradeInStatus } from '../../lib/lifecycle';
import { calculateOffer, maximumPossibleOffer, OFFER_CALCULATION_VERSION, selectRule } from '../../lib/offer';
import type {
  CatalogItem,
  CatalogSearchResponse,
  CustomerTradeInView,
  EstimateResponse,
  FormConfig,
  MyTradeInsResponse,
  ProductCtaResponse,
  SubmitRequest,
  SubmitResponse,
} from '../../lib/schemas/api';
import { CUSTOMER_ACTIONS } from '../../lib/schemas/api';
import type { ConditionAnswers, Rule, Settings } from '../../lib/schemas/domain';
import { COLLECTIONS } from '../collections';
import type { RequestContext } from '../context';
import { randomReference } from '../crypto';
import { AppError } from '../errors';
import { DuplicateKeyError, type Repo } from '../repo';
import type { TradeInDoc, TradeInEventDoc } from '../types';
import { type AccessTokenService, authorizeCustomer, memberIdOf, requireSiteCaller } from './AuthorizationService';
import type { IdempotencyService } from './IdempotencyService';
import type { OutboxService } from './OutboxService';
import type { RulesService } from './RulesService';
import type { SettingsService } from './SettingsService';
import type { TradeInLifecycleService } from './TradeInLifecycleService';
import type { TradeInMediaService } from './TradeInMediaService';
import type { CatalogProduct, CatalogSearchResult } from './WixCatalogService';

// Customer-facing orchestration. Every value that affects money (price, category, offer) is
// read or computed here from trusted sources; the browser only supplies choices.

export type CatalogPort = {
  getProduct(instanceId: string, productId: string): Promise<CatalogProduct | undefined>;
  search(instanceId: string, term: string, limit?: number, cursor?: string): Promise<CatalogSearchResult | CatalogProduct[]>;
};
export type OrdersPort = {
  eligibleItemsForMember(memberId: string): Promise<{ orderId: string; productId: string; title: string; imageUrl?: string }[]>;
  verifyMemberOrderItem(memberId: string, orderId: string, productId: string): Promise<boolean>;
};

type Deps = {
  repo: Repo;
  catalog: CatalogPort;
  orders: OrdersPort;
  rules: RulesService;
  settings: SettingsService;
  media: TradeInMediaService;
  lifecycle: TradeInLifecycleService;
  idempotency: IdempotencyService;
  outbox: OutboxService;
  tokens: AccessTokenService;
  now?: () => Date;
};

const SHOW_HANDOFF_FROM: readonly TradeInStatus[] = ['approved', 'in_transit', 'return_pending'];

export class TradeInService {
  private readonly now: () => Date;
  constructor(private readonly d: Deps) {
    this.now = d.now ?? (() => new Date());
  }

  // ---- Catalog & offer ----------------------------------------------------------

  private async productAndRule(instanceId: string, productId: string): Promise<{ product: CatalogProduct; rule: Rule } | undefined> {
    const product = await this.d.catalog.getProduct(instanceId, productId);
    if (!product || !product.visible) return undefined;
    const rule = selectRule(await this.d.rules.listEnabled(instanceId), { productId: product.productId, categoryIds: product.categoryIds });
    return rule ? { product, rule } : undefined;
  }

  async searchCatalog(ctx: RequestContext, q: string, cursor?: string): Promise<CatalogSearchResponse> {
    requireSiteCaller(ctx);
    const rules = await this.d.rules.listEnabled(ctx.instanceId);
    if (!rules.length) return { items: [], hasMore: false };
    const res = await this.d.catalog.search(ctx.instanceId, q, 24, cursor);
    const found = Array.isArray(res) ? res : res.products;
    const nextCursor = Array.isArray(res) ? undefined : res.nextCursor;
    const hasMore = Array.isArray(res) ? false : res.hasMore;
    const items = found
      .filter((p) => selectRule(rules, { productId: p.productId, categoryIds: p.categoryIds }))
      .map((p) => ({ productId: p.productId, title: p.title, imageUrl: p.imageUrl, source: 'catalog' as const }));
    return { items, nextCursor, hasMore };
  }

  async memberOrderItems(ctx: RequestContext): Promise<CatalogItem[]> {
    const memberId = memberIdOf(ctx);
    if (!memberId) return [];
    const items = await this.d.orders.eligibleItemsForMember(memberId);
    const out: CatalogItem[] = [];
    for (const item of items.slice(0, 30)) {
      if (await this.productAndRule(ctx.instanceId, item.productId)) {
        out.push({ productId: item.productId, title: item.title, imageUrl: item.imageUrl, orderId: item.orderId, source: 'order' });
      }
    }
    return out;
  }

  async formConfig(ctx: RequestContext, productId: string): Promise<FormConfig> {
    requireSiteCaller(ctx);
    const settings = await this.d.settings.get(ctx.instanceId);
    const handoffMethods = publicHandoff(settings);
    const found = await this.productAndRule(ctx.instanceId, productId);
    const statusPageUrl = settings.pages.statusPageUrl || undefined;
    if (!found) return { eligible: false, questions: [], media: { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 }, handoffMethods, termsText: settings.termsText, statusPageUrl };
    const { product, rule } = found;
    return {
      eligible: true,
      product: { productId: product.productId, title: product.title, imageUrl: product.imageUrl },
      questions: rule.conditionQuestions.map((q) => ({
        id: q.id, label: q.label, helpText: q.helpText, required: q.required,
        options: q.options.map((o) => ({ id: o.id, label: o.label })),
      })),
      media: { photoMinimum: rule.photoMinimum, videoMode: rule.videoMode, videoMaxSeconds: rule.videoMaxSeconds },
      handoffMethods,
      termsText: settings.termsText,
      upToMinor: maximumPossibleOffer(rule, product.priceMinor),
      currency: product.currency,
      statusPageUrl,
    };
  }

  async estimate(ctx: RequestContext, productId: string, answers: ConditionAnswers): Promise<EstimateResponse> {
    requireSiteCaller(ctx);
    const found = await this.productAndRule(ctx.instanceId, productId);
    if (!found) return { eligible: false, reason: 'not_eligible' };
    const result = calculateOffer({ rule: found.rule, priceMinor: found.product.priceMinor, currency: found.product.currency, answers, partial: true });
    if (!result.eligible) return { eligible: false, reason: result.reason };
    const complete = found.rule.conditionQuestions.every((q) => !q.required || answers[q.id] !== undefined);
    return { eligible: true, offerMinor: result.breakdown.offerMinor, currency: result.breakdown.currency, complete };
  }

  async productCta(ctx: RequestContext, productId: string): Promise<ProductCtaResponse> {
    const found = await this.productAndRule(ctx.instanceId, productId);
    if (!found) return { eligible: false };
    const { pages } = await this.d.settings.get(ctx.instanceId);
    return {
      eligible: true,
      upToMinor: maximumPossibleOffer(found.rule, found.product.priceMinor),
      currency: found.product.currency,
      formPageUrl: pages.formPageUrl || undefined,
    };
  }

  // ---- Submission -----------------------------------------------------------------

  async submit(ctx: RequestContext, input: SubmitRequest): Promise<SubmitResponse> {
    requireSiteCaller(ctx);
    const memberId = memberIdOf(ctx);
    const created = await this.d.idempotency.run(
      { instanceId: ctx.instanceId, operation: 'submit', key: input.submissionKey, payload: { ...input, caller: ctx.caller.id } },
      () => this.createTradeIn(ctx, input, memberId),
    );
    // Retries of the same submission get a fresh link token; raw tokens are never stored.
    const accessToken = await this.d.tokens.mint(ctx.instanceId, created.tradeInId, 'submit');
    return { ...created, accessToken };
  }

  private async createTradeIn(ctx: RequestContext, input: SubmitRequest, memberId: string | undefined): Promise<{ tradeInId: string; reference: string }> {
    const settings = await this.d.settings.get(ctx.instanceId);
    if (!publicHandoff(settings).some((h) => h.method === input.handoffMethod)) {
      throw new AppError('bad_request', 'handoff disabled', { handoffMethod: 'disabled' });
    }
    const found = await this.productAndRule(ctx.instanceId, input.productId);
    if (!found) throw new AppError('bad_request', 'not eligible', { productId: 'not_eligible' });
    const { product, rule } = found;

    if (input.orderId) {
      if (!memberId || !(await this.d.orders.verifyMemberOrderItem(memberId, input.orderId, product.productId))) {
        throw new AppError('bad_request', 'order not verified', { orderId: 'invalid' });
      }
    }

    const offer = calculateOffer({ rule, priceMinor: product.priceMinor, currency: product.currency, answers: input.answers });
    if (!offer.eligible) throw new AppError('bad_request', `offer ${offer.reason}`, { answers: offer.reason });
    if (offer.breakdown.offerMinor < settings.credit.minimumCreditMinor || offer.breakdown.offerMinor <= 0) {
      throw new AppError('bad_request', 'below minimum credit', { answers: 'below_minimum' });
    }

    const mediaRequirements = { photoMinimum: rule.photoMinimum, videoMode: rule.videoMode, videoMaxSeconds: rule.videoMaxSeconds };
    const media = await this.d.media.validateForSubmission(ctx.instanceId, input.uploadSessionId, input.mediaIds, mediaRequirements);

    let doc: TradeInDoc | undefined;
    for (let attempt = 0; attempt < 5 && !doc; attempt++) {
      try {
        doc = await this.d.repo.insert<TradeInDoc>(COLLECTIONS.tradeIns, {
          instanceId: ctx.instanceId,
          reference: randomReference(),
          memberId,
          customerEmail: input.contact.email.toLowerCase(),
          customerName: input.contact.name,
          customerPhone: input.contact.phone || undefined,
          productId: product.productId,
          orderId: input.orderId,
          categoryId: product.categoryIds[0],
          productTitle: product.title,
          productSnapshot: {
            title: product.title, imageUrl: product.imageUrl, sku: product.sku, priceMinor: product.priceMinor,
            currency: product.currency, catalogVersion: product.catalogVersion, categoryIds: product.categoryIds,
          },
          conditionAnswers: input.answers,
          estimatedValueMinor: offer.breakdown.offerMinor,
          currency: product.currency,
          offerCalculationVersion: OFFER_CALCULATION_VERSION,
          offerBreakdown: offer.breakdown,
          status: 'submitted',
          revision: 1,
          handoffMethod: input.handoffMethod,
          internalNotes: [],
          giftCardStatus: 'not_started',
          resaleDraftStatus: 'not_started',
          submissionKey: input.submissionKey,
          locale: input.locale,
          mediaRequirements,
        });
      } catch (err) {
        if (!(err instanceof DuplicateKeyError)) throw err; // reference collision: retry with a new one
      }
    }
    if (!doc) throw new AppError('internal', 'could not allocate reference');

    await this.d.media.attach(media, doc._id);
    await this.d.lifecycle.recordEvent({
      instanceId: ctx.instanceId, tradeInId: doc._id, eventType: 'submitted', toStatus: 'submitted',
      actorType: 'customer', actorId: memberId, idempotencyKey: input.submissionKey,
      metadataSanitized: { photos: media.filter((m) => m.mediaType === 'photo').length, videos: media.filter((m) => m.mediaType === 'video').length },
    });
    await this.d.outbox.enqueue({
      instanceId: ctx.instanceId, eventType: 'trade_in.submitted', tradeInId: doc._id,
      payload: { reference: doc.reference }, dedupeKey: `submitted:${doc._id}`,
    });
    return { tradeInId: doc._id, reference: doc.reference };
  }

  // ---- Customer status & actions ------------------------------------------------------

  private async loadForCustomer(ctx: RequestContext, ref: { token?: string; tradeInId?: string }) {
    requireSiteCaller(ctx);
    const tokenTradeInId = ref.token ? await this.d.tokens.resolve(ctx.instanceId, ref.token) : undefined;
    const id = tokenTradeInId ?? ref.tradeInId;
    if (!id) throw new AppError('not_found');
    const doc = await this.d.lifecycle.load(ctx.instanceId, id);
    const actor = authorizeCustomer(ctx, doc, tokenTradeInId);
    return { doc: await this.expireRevisedOfferIfDue(doc), actor };
  }

  /** Revised offers expire lazily: the first read after the deadline declines on the customer's behalf. */
  private async expireRevisedOfferIfDue(doc: TradeInDoc): Promise<TradeInDoc> {
    if (doc.status !== 'revised_offer_pending' || !doc.revisedOfferExpiresAt || new Date(doc.revisedOfferExpiresAt) > this.now()) return doc;
    try {
      return await this.d.lifecycle.transition({
        instanceId: doc.instanceId, tradeInId: doc._id, action: 'decline_revised_offer', actor: { type: 'system' },
        expectedRevision: doc.revision, reason: 'revised_offer_expired',
      });
    } catch (err) {
      if (err instanceof AppError && err.code === 'conflict') return this.d.lifecycle.load(doc.instanceId, doc._id);
      throw err;
    }
  }

  async getForCustomer(ctx: RequestContext, ref: { token?: string; tradeInId?: string }): Promise<CustomerTradeInView> {
    const { doc } = await this.loadForCustomer(ctx, ref);
    const settings = await this.d.settings.get(ctx.instanceId);
    const events = await this.d.lifecycle.timeline(ctx.instanceId, doc._id);
    return toCustomerView(doc, events, settings);
  }

  async customerAction(ctx: RequestContext, input: {
    token?: string; tradeInId?: string; action: (typeof CUSTOMER_ACTIONS)[number]; expectedRevision: number; trackingNumber?: string; idempotencyKey: string;
  }): Promise<CustomerTradeInView> {
    const { doc, actor } = await this.loadForCustomer(ctx, input);
    const settings = await this.d.settings.get(ctx.instanceId);
    if (input.action === 'cancel' && !settings.allowCustomerCancel) throw new AppError('forbidden', 'cancellation disabled');
    if (input.action === 'mark_in_transit' && doc.handoffMethod !== 'ship_in') throw new AppError('invalid_transition', 'not ship-in');
    if (input.action === 'accept_revised_offer' && doc.revisedValueMinor === undefined) throw new AppError('invalid_transition', 'no revised offer');

    await this.d.lifecycle.transition({
      instanceId: ctx.instanceId,
      tradeInId: doc._id,
      action: input.action,
      actor,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      patch:
        input.action === 'mark_in_transit' && input.trackingNumber && settings.handoff.shipIn.allowTracking
          ? { trackingNumber: input.trackingNumber }
          : input.action === 'accept_revised_offer'
            ? { finalValueMinor: doc.revisedValueMinor }
            : input.action === 'decline_revised_offer'
              ? { returnStatus: 'pending' }
              : undefined,
    });
    return this.getForCustomer(ctx, input);
  }

  async listForMember(ctx: RequestContext, cursor: number): Promise<MyTradeInsResponse> {
    const memberId = memberIdOf(ctx);
    const { pages } = await this.d.settings.get(ctx.instanceId);
    const links = { statusPageUrl: pages.statusPageUrl || undefined, formPageUrl: pages.formPageUrl || undefined };
    if (!memberId) return { items: [], signedIn: false, ...links };
    const pageSize = 20;
    const res = await this.d.repo.find<TradeInDoc>(
      COLLECTIONS.tradeIns,
      { instanceId: ctx.instanceId, memberId },
      { sort: [{ field: '_createdDate', order: 'desc' }], limit: pageSize + 1, skip: cursor },
    );
    const items = res.items.slice(0, pageSize).map((d) => ({
      tradeInId: d._id, reference: d.reference, status: d.status, productTitle: d.productTitle,
      createdAt: toIso(d._createdDate), estimatedValueMinor: d.estimatedValueMinor, currency: d.currency,
    }));
    return { items, nextCursor: res.items.length > pageSize ? cursor + pageSize : undefined, signedIn: true, ...links };
  }
}

function publicHandoff(settings: Settings): FormConfig['handoffMethods'] {
  const out: FormConfig['handoffMethods'] = [];
  if (settings.handoff.dropOff.enabled) out.push({ method: 'drop_off' });
  if (settings.handoff.shipIn.enabled) out.push({ method: 'ship_in' });
  return out;
}

function toIso(d: unknown): string {
  return d ? new Date(d as string).toISOString() : '';
}

export function toCustomerView(doc: TradeInDoc, events: TradeInEventDoc[], settings: Settings): CustomerTradeInView {
  const method = doc.handoffMethod;
  const config = method === 'drop_off' ? settings.handoff.dropOff : settings.handoff.shipIn;
  // Addresses/instructions only once the merchant has approved the hand-off.
  const showHandoff = SHOW_HANDOFF_FROM.includes(doc.status);
  const actions = availableActions(doc.status, 'customer').filter((a): a is (typeof CUSTOMER_ACTIONS)[number] =>
    (CUSTOMER_ACTIONS as readonly string[]).includes(a) &&
    (a !== 'cancel' || settings.allowCustomerCancel) &&
    (a !== 'mark_in_transit' || method === 'ship_in'),
  );
  return {
    tradeInId: doc._id,
    reference: doc.reference,
    status: doc.status,
    revision: doc.revision,
    createdAt: toIso(doc._createdDate),
    product: { title: doc.productTitle, imageUrl: doc.productSnapshot?.imageUrl },
    currency: doc.currency,
    estimatedValueMinor: doc.estimatedValueMinor,
    finalValueMinor: doc.finalValueMinor,
    revisedOffer:
      doc.revisedValueMinor !== undefined
        ? { amountMinor: doc.revisedValueMinor, reason: doc.revisedOfferReason, expiresAt: doc.revisedOfferExpiresAt ? toIso(doc.revisedOfferExpiresAt) : undefined }
        : undefined,
    rejectionReason: doc.status === 'rejected' || doc.status === 'return_pending' ? doc.rejectionReason : undefined,
    handoff: {
      method,
      address: showHandoff ? config.address || undefined : undefined,
      instructions: showHandoff ? config.instructions || undefined : undefined,
      trackingNumber: doc.trackingNumber,
      allowTracking: method === 'ship_in' && settings.handoff.shipIn.allowTracking,
    },
    actions,
    // Status-only history: no actor IDs, notes or internal reasons.
    timeline: events.filter((e) => e.toStatus).map((e) => ({ status: e.toStatus as TradeInStatus, at: toIso(e._createdDate) })),
  };
}
