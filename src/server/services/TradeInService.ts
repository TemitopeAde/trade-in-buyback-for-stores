import { availableActions, type TradeInStatus } from '../../lib/lifecycle';
import { calculateOffer, maximumPossibleOffer, OFFER_CALCULATION_VERSION, selectRule } from '../../lib/offer';
import { monthStart, type PlanEntitlements } from '../../lib/plans';
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
import type { ConditionAnswers, CustomItem, Rule, Settings, VideoMode } from '../../lib/schemas/domain';
import { hasTerms } from '../../lib/terms';
import { COLLECTIONS } from '../collections';
import type { RequestContext } from '../context';
import { randomReference } from '../crypto';
import { AppError } from '../errors';
import { DuplicateKeyError, type Repo } from '../repo';
import { TRADE_IN_DELETED_EVENT, type TradeInDoc, type TradeInEventDoc } from '../types';
import { type AccessTokenService, authorizeCustomer, memberIdOf, requireSiteCaller } from './AuthorizationService';
import type { IdempotencyService } from './IdempotencyService';
import type { OutboxService } from './OutboxService';
import type { PlanLimits } from './PlanService';
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
  /** The site's payment currency, for custom items (catalog items use the product's currency). */
  siteCurrency: (instanceId: string) => Promise<string>;
  /** Plan limits (monthly requests, uploads). Omitted = unlimited. */
  plan?: PlanLimits;
  now?: () => Date;
};

const NO_MEDIA = { photoMinimum: 0, videoMode: 'off', videoMaxSeconds: 0 } as const;

type ItemFields = {
  fields: Pick<TradeInDoc, 'productId' | 'categoryId' | 'productTitle' | 'productSnapshot' | 'customItem' | 'estimatedValueMinor' | 'currency' | 'offerBreakdown'>;
  mediaRequirements: { photoMinimum: number; videoMode: VideoMode; videoMaxSeconds: number };
};

const SHOW_HANDOFF_FROM: readonly TradeInStatus[] = ['approved', 'in_transit', 'return_pending'];

export class TradeInService {
  private readonly now: () => Date;
  constructor(private readonly d: Deps) {
    this.now = d.now ?? (() => new Date());
  }

  // ---- Plan limits ------------------------------------------------------------------

  private async limits(instanceId: string): Promise<PlanEntitlements | undefined> {
    return this.d.plan?.entitlements(instanceId);
  }

  /** False once this calendar month's request allowance is used up. */
  /** The store takes new requests once it has published terms and while the plan allowance lasts. */
  private async accepting(instanceId: string, e: PlanEntitlements | undefined, settings: Settings): Promise<boolean> {
    if (!hasTerms(settings.termsHtml)) return false;
    if (!e || e.maxRequestsPerMonth === Infinity) return true;
    return (await this.usedThisMonth(instanceId)) < e.maxRequestsPerMonth;
  }

  /** Requests created this month, including ones the merchant has since deleted. */
  private async usedThisMonth(instanceId: string): Promise<number> {
    const since = { $gte: monthStart(this.now()) };
    const [live, deleted] = await Promise.all([
      this.d.repo.count(COLLECTIONS.tradeIns, { instanceId, _createdDate: since }),
      this.d.repo.count(COLLECTIONS.events, { instanceId, eventType: TRADE_IN_DELETED_EVENT, _createdDate: since }),
    ]);
    return live + deleted;
  }

  /** Requests used this month and the plan allowance (null = unlimited), for the dashboard. */
  async monthlyUsage(instanceId: string): Promise<{ used: number; limit: number | null }> {
    const e = await this.limits(instanceId);
    const used = await this.usedThisMonth(instanceId);
    return { used, limit: !e || e.maxRequestsPerMonth === Infinity ? null : e.maxRequestsPerMonth };
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
    const e = await this.limits(ctx.instanceId);
    const accepting = await this.accepting(ctx.instanceId, e, settings);
    const uploads = !e || e.mediaUploads;
    const found = await this.productAndRule(ctx.instanceId, productId);
    const statusPageUrl = settings.pages.statusPageUrl || undefined;
    if (!found) return { eligible: false, accepting, uploads, questions: [], media: { ...NO_MEDIA }, handoffMethods, termsHtml: settings.termsHtml, statusPageUrl };
    const { product, rule } = found;
    return {
      eligible: true,
      accepting,
      uploads,
      product: { productId: product.productId, title: product.title, imageUrl: product.imageUrl },
      questions: rule.conditionQuestions.map((q) => ({
        id: q.id, label: q.label, helpText: q.helpText, required: q.required,
        options: q.options.map((o) => ({ id: o.id, label: o.label })),
      })),
      media: uploads ? { photoMinimum: rule.photoMinimum, videoMode: rule.videoMode, videoMaxSeconds: rule.videoMaxSeconds } : { ...NO_MEDIA },
      handoffMethods,
      termsHtml: settings.termsHtml,
      upToMinor: maximumPossibleOffer(rule, product.priceMinor),
      currency: product.currency,
      statusPageUrl,
    };
  }

  /** Form config for describing a custom item; not eligible unless the store enabled custom items. */
  async customItemConfig(ctx: RequestContext): Promise<FormConfig> {
    requireSiteCaller(ctx);
    const settings = await this.d.settings.get(ctx.instanceId);
    const e = await this.limits(ctx.instanceId);
    const uploads = !e || e.mediaUploads;
    return {
      eligible: settings.customItems.enabled,
      accepting: await this.accepting(ctx.instanceId, e, settings),
      uploads,
      questions: [],
      media: uploads ? customItemMedia(settings) : { ...NO_MEDIA },
      handoffMethods: publicHandoff(settings),
      termsHtml: settings.termsHtml,
      currency: await this.d.siteCurrency(ctx.instanceId),
      statusPageUrl: settings.pages.statusPageUrl || undefined,
      custom: true,
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
    // While the store can't take new requests this month the widget shows a disabled button.
    // `eligible` stays false so nothing can open the form.
    const settings = await this.d.settings.get(ctx.instanceId);
    if (!(await this.accepting(ctx.instanceId, await this.limits(ctx.instanceId), settings))) return { eligible: false, accepting: false };
    const { pages } = settings;
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
    const e = await this.limits(ctx.instanceId);
    // Checked inside the idempotent run, so replaying an accepted submission still succeeds.
    // Two simultaneous last submissions can both pass; the cap is a plan limit, not a hard quota.
    if (!hasTerms(settings.termsHtml)) throw new AppError('bad_request', 'store has no trade-in terms', { form: 'not_accepting' });
    if (!(await this.accepting(ctx.instanceId, e, settings))) throw new AppError('bad_request', 'monthly request limit reached', { form: 'not_accepting' });
    if (!publicHandoff(settings).some((h) => h.method === input.handoffMethod)) {
      throw new AppError('bad_request', 'handoff disabled', { handoffMethod: 'disabled' });
    }
    const uploads = !e || e.mediaUploads;
    if (!uploads && input.mediaIds.length) throw new AppError('bad_request', 'uploads not available', { media: 'not_available' });
    const item = input.customItem ? customItemFields(input.customItem, settings, await this.d.siteCurrency(ctx.instanceId)) : await this.catalogItemFields(ctx, input, memberId, settings);
    const mediaRequirements = uploads ? item.mediaRequirements : { ...NO_MEDIA };
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
          ...item.fields,
          orderId: input.customItem ? undefined : input.orderId,
          conditionAnswers: input.customItem ? {} : input.answers,
          offerCalculationVersion: OFFER_CALCULATION_VERSION,
          status: 'submitted',
          revision: 1,
          handoffMethod: input.handoffMethod,
          internalNotes: [],
          giftCardStatus: 'not_started',
          resaleDraftStatus: 'not_started',
          submissionKey: input.submissionKey,
          locale: input.locale,
          mediaRequirements,
          // What the customer agreed to, kept even if the store edits its terms later.
          termsHtml: settings.termsHtml,
          termsAcceptedAt: this.now(),
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
      metadataSanitized: {
        photos: media.filter((m) => m.mediaType === 'photo').length, videos: media.filter((m) => m.mediaType === 'video').length,
        ...(input.customItem ? { customItem: true } : {}),
      },
    });
    await this.d.outbox.enqueue({
      instanceId: ctx.instanceId, eventType: 'trade_in.submitted', tradeInId: doc._id,
      payload: { reference: doc.reference }, dedupeKey: `submitted:${doc._id}`,
    });
    return { tradeInId: doc._id, reference: doc.reference };
  }

  /** Catalog product: re-read price and rule, verify the order, compute the offer. */
  private async catalogItemFields(ctx: RequestContext, input: SubmitRequest, memberId: string | undefined, settings: Settings): Promise<ItemFields> {
    const found = input.productId ? await this.productAndRule(ctx.instanceId, input.productId) : undefined;
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
    return {
      fields: {
        productId: product.productId,
        categoryId: product.categoryIds[0],
        productTitle: product.title,
        productSnapshot: {
          title: product.title, imageUrl: product.imageUrl, sku: product.sku, priceMinor: product.priceMinor,
          currency: product.currency, catalogVersion: product.catalogVersion, categoryIds: product.categoryIds,
        },
        estimatedValueMinor: offer.breakdown.offerMinor,
        currency: product.currency,
        offerBreakdown: offer.breakdown,
      },
      mediaRequirements: { photoMinimum: rule.photoMinimum, videoMode: rule.videoMode, videoMaxSeconds: rule.videoMaxSeconds },
    };
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

  /** Quotes and revised offers expire lazily: the first read after the deadline declines on the customer's behalf. */
  private async expireRevisedOfferIfDue(doc: TradeInDoc): Promise<TradeInDoc> {
    const pending =
      doc.status === 'revised_offer_pending' ? { at: doc.revisedOfferExpiresAt, action: 'decline_revised_offer' as const, reason: 'revised_offer_expired' }
        : doc.status === 'quote_pending' ? { at: doc.quoteExpiresAt, action: 'decline_quote' as const, reason: 'quote_expired' }
          : undefined;
    if (!pending?.at || new Date(pending.at) > this.now()) return doc;
    try {
      return await this.d.lifecycle.transition({
        instanceId: doc.instanceId, tradeInId: doc._id, action: pending.action, actor: { type: 'system' },
        expectedRevision: doc.revision, reason: pending.reason,
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
    if (input.action === 'accept_quote' && doc.quotedValueMinor === undefined) throw new AppError('invalid_transition', 'no quote');

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
          : input.action === 'accept_quote'
            ? { estimatedValueMinor: doc.quotedValueMinor }
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
      createdAt: toIso(d._createdDate), estimatedValueMinor: d.estimatedValueMinor, currency: d.currency, custom: !!d.customItem,
    }));
    return { items, nextCursor: res.items.length > pageSize ? cursor + pageSize : undefined, signedIn: true, ...links };
  }
}

function customItemMedia(settings: Settings) {
  return { photoMinimum: settings.customItems.photoMinimum, videoMode: 'off' as const, videoMaxSeconds: 0 };
}

/** Custom item: no product, price or offer. Staff quote a value once they've reviewed it. */
function customItemFields(customItem: CustomItem, settings: Settings, currency: string): ItemFields {
  if (!settings.customItems.enabled) throw new AppError('bad_request', 'custom items disabled', { customItem: 'disabled' });
  const title = [customItem.brand, customItem.name, customItem.model].filter(Boolean).join(' ').slice(0, 200);
  return {
    fields: {
      productId: '',
      productTitle: title,
      productSnapshot: { title, priceMinor: 0, currency, categoryIds: [] },
      customItem,
      estimatedValueMinor: 0,
      currency,
    },
    mediaRequirements: customItemMedia(settings),
  };
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
    custom: !!doc.customItem,
    currency: doc.currency,
    estimatedValueMinor: doc.estimatedValueMinor,
    finalValueMinor: doc.finalValueMinor,
    quote:
      doc.status === 'quote_pending' && doc.quotedValueMinor !== undefined
        ? { amountMinor: doc.quotedValueMinor, expiresAt: doc.quoteExpiresAt ? toIso(doc.quoteExpiresAt) : undefined }
        : undefined,
    revisedOffer:
      doc.revisedValueMinor !== undefined
        ? { amountMinor: doc.revisedValueMinor, reason: doc.revisedOfferReason, expiresAt: doc.revisedOfferExpiresAt ? toIso(doc.revisedOfferExpiresAt) : undefined }
        : undefined,
    rejectionReason: doc.status === 'rejected' || doc.status === 'return_pending' ? doc.rejectionReason : undefined,
    giftCardCodePending: doc.giftCardStatus === 'issued' && (doc.giftCardEmailStatus === 'failed' || doc.giftCardEmailStatus === 'disabled'),
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
