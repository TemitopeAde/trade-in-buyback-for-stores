import { APP_TOOL_DEFS } from '../../lib/app-tools';
import { formatMoney, toMinor } from '../../lib/money';
import { STATUS_GROUPS } from '../../lib/schemas/admin';
import { NOTIFICATION_EVENTS } from '../../lib/schemas/domain';
import { COLLECTIONS } from '../collections';
import { sha256Hex, stableStringify } from '../crypto';
import { AppError } from '../errors';
import type { Repo } from '../repo';
import type { Actor, TradeInDoc } from '../types';
import type { CreditService } from './CreditService';
import type { MerchantService } from './MerchantService';
import type { ReportingService } from './ReportingService';
import type { ResaleDraftService } from './ResaleDraftService';
import type { RulesService } from './RulesService';
import type { SettingsService } from './SettingsService';

// Aria / App Tools. Tools run as an `assistant` actor through the same services as the dashboard,
// so business rules, transition table, idempotency and instance isolation are identical.
// Consequential tools use a two-step protocol: the first call returns a summary and a
// confirmation code bound to (user, tool, trade-in revision, arguments); only a second call with
// that code acts, and it fails if anything changed in between.

type Deps = {
  repo: Repo;
  merchant: MerchantService;
  credit: CreditService;
  resale: ResaleDraftService;
  reporting: ReportingService;
  rules: RulesService;
  settings: SettingsService;
};

export type ToolContext = { instanceId: string; userId: string };
type Payload = Record<string, unknown>;

const CONSEQUENTIAL = new Set(APP_TOOL_DEFS.filter((d) => d.consequential).map((d) => d.methodName));

const str = (p: Payload, k: string, max = 1000) => {
  const v = p[k];
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
};
const req = (p: Payload, k: string, max?: number) => {
  const v = str(p, k, max);
  if (!v) throw new AppError('bad_request', `${k} is required`);
  return v;
};

export class AriaToolsService {
  constructor(private readonly d: Deps) {}

  async run(ctx: ToolContext, methodName: string, payload: Payload): Promise<Record<string, unknown>> {
    const actor: Actor = { type: 'assistant', id: ctx.userId };
    const I = ctx.instanceId;
    switch (methodName) {
      case 'search-trade-ins': {
        const group = str(payload, 'statusGroup');
        const res = await this.d.merchant.list(I, {
          q: str(payload, 'query', 120) ?? '', sort: 'created_desc', page: 0, pageSize: 20,
          statusGroup: group && group in STATUS_GROUPS ? (group as keyof typeof STATUS_GROUPS) : undefined,
        });
        return { total: res.total, results: res.items.map((r) => ({ reference: r.reference, customer: r.customerName, product: r.productTitle, status: r.status, estimatedOffer: fmt(r.estimatedValueMinor, r.currency), submittedAt: r.createdAt })) };
      }
      case 'get-trade-in': {
        const doc = await this.byReference(I, payload);
        const d = await this.d.merchant.detail(I, doc._id);
        return {
          reference: d.reference, status: d.status, customer: { name: d.customerName, email: d.customerEmail }, product: d.productTitle,
          conditionAnswers: d.conditionAnswers.map((a) => ({ question: a.question, answer: a.answer })),
          estimatedOffer: fmt(d.estimatedValueMinor, d.currency), finalCredit: d.finalValueMinor !== undefined ? fmt(d.finalValueMinor, d.currency) : undefined,
          revisedOffer: d.revisedValueMinor !== undefined ? fmt(d.revisedValueMinor, d.currency) : undefined, handoff: d.handoffMethod,
          giftCardStatus: d.giftCardStatus, evidence: { photos: d.media.filter((m) => m.kind === 'photo').length, videos: d.media.filter((m) => m.kind === 'video').length },
          availableActions: d.actions, timeline: d.timeline.filter((e) => e.toStatus).map((e) => ({ status: e.toStatus, by: e.actorType, at: e.at })),
        };
      }
      case 'summarize-trade-in': {
        const doc = await this.byReference(I, payload);
        const d = await this.d.merchant.detail(I, doc._id);
        const steps = d.timeline.filter((e) => e.toStatus).map((e) => `${e.toStatus} (${e.actorType}, ${e.at.slice(0, 10)})`);
        return {
          summary: `${d.customerName} submitted ${d.productTitle} on ${d.createdAt.slice(0, 10)} with an estimate of ${fmt(d.estimatedValueMinor, d.currency)}. It is now ${d.status}.`,
          history: steps, nextActions: d.actions,
        };
      }
      case 'workload-summary': {
        const o = await this.d.merchant.overview(I);
        return { counts: o.counts, creditIssued: Object.entries(o.creditIssuedMinorByCurrency).map(([c, m]) => fmt(m, c)) };
      }
      case 'explain-estimate': {
        const doc = await this.byReference(I, payload);
        const b = doc.offerBreakdown;
        const rule = await this.d.rules.get(I, b.ruleId).catch(() => undefined);
        return {
          productPrice: fmt(b.basePriceMinor, doc.currency), payoutPercent: b.payoutBasisPoints / 100, baseOffer: fmt(b.baseOfferMinor, doc.currency),
          adjustments: b.adjustments.map((a) => ({ question: a.questionId, answer: a.optionId, change: fmt(a.deltaMinor, doc.currency) })),
          clampedTo: b.clampedTo, estimate: fmt(b.offerMinor, doc.currency),
          rule: rule ? { name: rule.name, version: b.ruleVersion, currentVersion: rule.version } : { id: b.ruleId, note: 'rule since deleted' },
          method: 'price × payout, then percentage answers, then fixed answers, then minimum/maximum',
        };
      }
      case 'recommend-decision': {
        const doc = await this.byReference(I, payload);
        const d = await this.d.merchant.detail(I, doc._id);
        const photos = d.media.filter((m) => m.kind === 'photo' && m.status !== 'failed').length;
        const concerns: string[] = [];
        if (photos < (doc.mediaRequirements?.photoMinimum ?? 0)) concerns.push('fewer photos than the rule requires');
        if (doc.mediaRequirements?.videoMode === 'required' && !d.media.some((m) => m.kind === 'video')) concerns.push('required video missing');
        if (d.offerBreakdown.clampedTo === 'minimum') concerns.push('offer was raised to the rule minimum');
        if (d.media.some((m) => m.status === 'processing')) concerns.push('some media is still processing');
        return {
          advisoryOnly: true,
          suggestion: concerns.length ? 'Review evidence before approving' : 'Looks consistent with your rules; approval is reasonable',
          concerns, evidence: { photos, videos: d.media.filter((m) => m.kind === 'video').length }, estimate: fmt(d.estimatedValueMinor, d.currency), status: d.status,
        };
      }
      case 'gift-card-status': {
        const doc = await this.byReference(I, payload);
        return { status: doc.status, giftCardStatus: doc.giftCardStatus, giftCardEmailStatus: doc.giftCardEmailStatus, issuedAt: doc.giftCardIssuedAt, credit: doc.finalValueMinor !== undefined ? fmt(doc.finalValueMinor, doc.currency) : undefined, note: 'Gift card codes are delivered only by Wix to the customer.' };
      }
      case 'list-rules': {
        const rules = await this.d.rules.list(I);
        return { rules: rules.map((r) => ({ name: r.name, enabled: r.enabled, appliesTo: r.scope, payoutPercent: r.payoutPercentage, questions: r.conditionQuestions.map((q) => q.label), photoMinimum: r.photoMinimum, video: r.videoMode })) };
      }
      case 'get-notification-prefs': {
        const n = (await this.d.settings.get(I)).notifications;
        return { teamRecipients: n.staffUserIds.length, merchant: n.merchant, customer: n.customer };
      }
      case 'trade-in-report': {
        const days = Math.min(365, Math.max(1, Number(payload.days) || 30));
        const r = await this.d.reporting.report(I, days);
        const money = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => fmt(v, c));
        return { ...r, creditIssued: money(r.creditIssuedMinorByCurrency), creditRedeemed: money(r.creditRedeemedMinorByCurrency) };
      }
      default:
        if (CONSEQUENTIAL.has(methodName)) return this.consequential(ctx, actor, methodName, payload);
        throw new AppError('bad_request', `unknown tool ${methodName}`);
    }
  }

  private async consequential(ctx: ToolContext, actor: Actor, methodName: string, payload: Payload) {
    const I = ctx.instanceId;
    const plan = await this.plan(I, methodName, payload);
    const code = (await sha256Hex(`${I}|${ctx.userId}|${methodName}|${plan.revisionKey}|${stableStringify(plan.args)}`)).slice(0, 10);
    if (str(payload, 'confirmationCode') !== code) {
      return { requiresConfirmation: true, summary: plan.summary, confirmationCode: code, instructions: 'Show the summary to the user. Call again with this confirmationCode only after the user explicitly confirms.' };
    }
    const result = await plan.execute(actor);
    return { done: true, summary: plan.summary, result };
  }

  /** Validates inputs and describes the change before anything is executed. */
  private async plan(I: string, methodName: string, p: Payload): Promise<{ summary: string; revisionKey: string; args: unknown; execute: (a: Actor) => Promise<unknown> }> {
    const key = (doc: TradeInDoc) => `${doc._id}:${doc.revision}`;
    const act = (doc: TradeInDoc, action: Parameters<MerchantService['act']>[2]['action'], extra: Partial<Parameters<MerchantService['act']>[2]> = {}) => async (a: Actor) => {
      const d = await this.d.merchant.act(I, a, { tradeInId: doc._id, action, expectedRevision: doc.revision, idempotencyKey: `aria-${doc._id}-${doc.revision}-${action}`.slice(0, 64), ...extra });
      return { reference: d.reference, status: d.status };
    };
    switch (methodName) {
      case 'approve-trade-in': {
        const doc = await this.byReference(I, p);
        return { summary: `Approve ${doc.reference} (${doc.productTitle}, estimate ${fmt(doc.estimatedValueMinor, doc.currency)}). The customer will receive hand-off instructions.`, revisionKey: key(doc), args: {}, execute: act(doc, 'approve') };
      }
      case 'reject-trade-in': {
        const doc = await this.byReference(I, p);
        const reason = req(p, 'reason');
        return { summary: `Reject ${doc.reference} (${doc.productTitle}). The customer will see the reason: “${reason}”.`, revisionKey: key(doc), args: { reason }, execute: act(doc, 'reject', { reason }) };
      }
      case 'mark-received': {
        const doc = await this.byReference(I, p);
        return { summary: `Mark ${doc.reference} (${doc.productTitle}) as received.`, revisionKey: key(doc), args: {}, execute: act(doc, 'receive') };
      }
      case 'record-inspection': {
        const doc = await this.byReference(I, p);
        const outcome = req(p, 'outcome');
        const notes = str(p, 'notes', 2000);
        if (outcome === 'start') return { summary: `Start inspection of ${doc.reference}.`, revisionKey: key(doc), args: { outcome }, execute: act(doc, 'start_inspection') };
        if (outcome === 'confirm_value') {
          return { summary: `Confirm ${doc.reference} at ${fmt(doc.estimatedValueMinor, doc.currency)} and issue that amount as store credit (Wix gift card). This can’t be undone.`, revisionKey: key(doc), args: { outcome, notes }, execute: act(doc, 'confirm_value', { inspectionNotes: notes }) };
        }
        if (outcome === 'reject') {
          const reason = req(p, 'reason');
          return { summary: `Reject ${doc.reference} after inspection and return the item. Reason shown to the customer: “${reason}”.`, revisionKey: key(doc), args: { outcome, reason, notes }, execute: act(doc, 'reject_after_inspection', { reason, inspectionNotes: notes }) };
        }
        throw new AppError('bad_request', 'outcome must be start, confirm_value or reject');
      }
      case 'send-revised-offer': {
        const doc = await this.byReference(I, p);
        const amount = req(p, 'amount', 20);
        if (!/^\d+(\.\d+)?$/.test(amount)) throw new AppError('bad_request', 'amount must be a number like 35.00');
        const minor = toMinor(amount, doc.currency);
        const reason = req(p, 'reason');
        return {
          summary: `Offer ${fmt(minor, doc.currency)} instead of ${fmt(doc.estimatedValueMinor, doc.currency)} for ${doc.reference}. Reason shown to the customer: “${reason}”. The customer will accept or decline.`,
          revisionKey: key(doc), args: { minor, reason }, execute: act(doc, 'send_revised_offer', { revisedValueMinor: minor, reason }),
        };
      }
      case 'reconcile-gift-card': {
        const doc = await this.byReference(I, p);
        return {
          summary: `Retry store credit of ${fmt(doc.finalValueMinor ?? 0, doc.currency)} for ${doc.reference}. The same gift card is reused, so credit can’t be issued twice.`,
          revisionKey: key(doc), args: {},
          execute: async (a) => { const d = await this.d.credit.issue(I, doc._id, a); return { status: d.status, giftCardStatus: d.giftCardStatus }; },
        };
      }
      case 'create-resale-draft': {
        const doc = await this.byReference(I, p);
        return {
          summary: `Create a hidden draft product in Wix Stores for ${doc.productTitle} (${doc.reference}). It won’t be published until you price and publish it.`,
          revisionKey: key(doc), args: {},
          execute: async (a) => { const d = await this.d.resale.create(I, doc._id, a); return { resaleDraftStatus: d.resaleDraftStatus }; },
        };
      }
      case 'set-rule-enabled': {
        const name = req(p, 'ruleName', 100);
        const enabled = p.enabled === true;
        const rule = (await this.d.rules.list(I)).find((r) => r.name.toLowerCase() === name.toLowerCase());
        if (!rule) throw new AppError('not_found', 'rule not found');
        return {
          summary: `${enabled ? 'Enable' : 'Disable'} the trade-in rule “${rule.name}”.`, revisionKey: `${rule._id}:${rule.version}`, args: { enabled },
          execute: async () => { const { _id, instanceId, version, ...input } = rule; void instanceId; void version; const r = await this.d.rules.update(I, _id, { ...input, enabled }); return { rule: r.name, enabled: r.enabled }; },
        };
      }
      case 'set-notification-pref': {
        const audience = req(p, 'audience');
        const event = req(p, 'event');
        const enabled = p.enabled === true;
        if (audience !== 'merchant' && audience !== 'customer') throw new AppError('bad_request', 'audience must be merchant or customer');
        if (!(NOTIFICATION_EVENTS[audience] as readonly string[]).includes(event)) throw new AppError('bad_request', 'unknown event');
        const current = await this.d.settings.get(I);
        return {
          summary: `${enabled ? 'Turn on' : 'Turn off'} the “${event}” email to ${audience === 'merchant' ? 'your team' : 'customers'}.`,
          revisionKey: `notif:${audience}:${event}:${(current.notifications[audience] as Record<string, boolean>)[event]}`, args: { audience, event, enabled },
          execute: async () => {
            const s = await this.d.settings.get(I);
            (s.notifications[audience] as Record<string, boolean>)[event] = enabled;
            await this.d.settings.save(I, s);
            return { audience, event, enabled };
          },
        };
      }
      default:
        throw new AppError('bad_request', `unknown tool ${methodName}`);
    }
  }

  private async byReference(instanceId: string, p: Payload): Promise<TradeInDoc> {
    const ref = req(p, 'reference', 20).toUpperCase();
    const res = await this.d.repo.find<TradeInDoc>(COLLECTIONS.tradeIns, { instanceId, reference: ref }, { limit: 1 });
    if (!res.items[0]) throw new AppError('not_found', `no trade-in ${ref}`);
    return res.items[0];
  }
}

function fmt(minor: number, currency: string) {
  return formatMoney(minor, currency, 'en');
}
