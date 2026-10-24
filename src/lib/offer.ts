import { applyBasisPoints, assertMinor, clamp } from './money';
import type { ConditionAnswers, OfferBreakdown, Rule } from './schemas/domain';

// Calculation order (documented for merchants in the Rules page):
//  1. base offer      = product price × payout percentage
//  2. percent answers = summed, then applied once to the base offer
//  3. fixed answers   = added
//  4. floor at zero, then clamp to the rule's minimum / maximum offer
// Bump when the algorithm changes so stored breakdowns stay explainable.
export const OFFER_CALCULATION_VERSION = 1;

export type OfferResult =
  | { eligible: true; breakdown: OfferBreakdown }
  | { eligible: false; reason: 'no_rule' | 'rejected_by_answer' | 'missing_answers' | 'invalid_answer'; questionIds?: string[] };

type ProductForRule = { productId: string; categoryIds: string[] };

/** Most specific enabled rule wins: product > category > all; ties broken by priority, then id. */
export function selectRule(rules: Rule[], product: ProductForRule): Rule | undefined {
  const specificity = (r: Rule) => (r.scope === 'product' ? 2 : r.scope === 'category' ? 1 : 0);
  return rules
    .filter((r) => r.enabled)
    .filter(
      (r) =>
        r.scope === 'all' ||
        (r.scope === 'product' && r.productIds.includes(product.productId)) ||
        (r.scope === 'category' && !!r.categoryId && product.categoryIds.includes(r.categoryId)),
    )
    .sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority || a._id.localeCompare(b._id))[0];
}

export function calculateOffer(input: {
  rule: Rule;
  priceMinor: number;
  currency: string;
  answers: ConditionAnswers;
  /** When true, unanswered required questions are tolerated (live estimate while the customer is mid-form). */
  partial?: boolean;
}): OfferResult {
  const { rule, priceMinor, currency, answers } = input;
  assertMinor(priceMinor);

  const known = new Set(rule.conditionQuestions.map((q) => q.id));
  const unknown = Object.keys(answers).filter((qid) => !known.has(qid));
  if (unknown.length) return { eligible: false, reason: 'invalid_answer', questionIds: unknown };

  const payoutBasisPoints = Math.round(rule.payoutPercentage * 100);
  const baseOfferMinor = applyBasisPoints(priceMinor, payoutBasisPoints);

  let percentBp = 0;
  let fixedMinor = 0;
  const missing: string[] = [];
  const picked: { questionId: string; optionId: string; kind: 'percent' | 'fixed'; value: number }[] = [];

  for (const q of rule.conditionQuestions) {
    const optionId = answers[q.id];
    if (optionId === undefined) {
      if (q.required) missing.push(q.id);
      continue;
    }
    const option = q.options.find((o) => o.id === optionId);
    if (!option) return { eligible: false, reason: 'invalid_answer', questionIds: [q.id] };
    const adj = option.adjustment;
    if (adj.kind === 'reject') return { eligible: false, reason: 'rejected_by_answer', questionIds: [q.id] };
    if (adj.kind === 'percent') {
      percentBp += adj.basisPoints;
      picked.push({ questionId: q.id, optionId, kind: 'percent', value: adj.basisPoints });
    } else {
      fixedMinor += adj.amountMinor;
      picked.push({ questionId: q.id, optionId, kind: 'fixed', value: adj.amountMinor });
    }
  }
  if (missing.length && !input.partial) return { eligible: false, reason: 'missing_answers', questionIds: missing };

  const adjustments = picked.map((p) => ({
    questionId: p.questionId,
    optionId: p.optionId,
    kind: p.kind,
    deltaMinor: p.kind === 'percent' ? applyBasisPoints(baseOfferMinor, p.value) : p.value,
  }));
  // Apply the summed percentage once so per-answer rounding cannot drift the total.
  const beforeClampMinor = Math.max(0, baseOfferMinor + applyBasisPoints(baseOfferMinor, percentBp) + fixedMinor);
  const offerMinor = clamp(beforeClampMinor, rule.minimumOfferMinor, rule.maximumOfferMinor);
  const clampedTo =
    offerMinor > beforeClampMinor ? ('minimum' as const) : offerMinor < beforeClampMinor ? ('maximum' as const) : undefined;

  return {
    eligible: true,
    breakdown: {
      basePriceMinor: priceMinor,
      payoutBasisPoints,
      baseOfferMinor,
      adjustments,
      beforeClampMinor,
      ...(clampedTo ? { clampedTo } : {}),
      offerMinor,
      currency,
      ruleId: rule._id,
      ruleVersion: rule.version,
    },
  };
}

/** The highest possible offer for a product ("Up to X" on the product page CTA). */
export function maximumPossibleOffer(rule: Rule, priceMinor: number): number {
  const base = applyBasisPoints(priceMinor, Math.round(rule.payoutPercentage * 100));
  let percentBp = 0;
  let fixedMinor = 0;
  for (const q of rule.conditionQuestions) {
    // Optional questions may be skipped, so "no answer" (0) is a candidate.
    let best: { value: number; bp: number; fixed: number } | undefined = q.required ? undefined : { value: 0, bp: 0, fixed: 0 };
    for (const o of q.options) {
      const a = o.adjustment;
      if (a.kind === 'reject') continue;
      const candidate =
        a.kind === 'percent'
          ? { value: applyBasisPoints(base, a.basisPoints), bp: a.basisPoints, fixed: 0 }
          : { value: a.amountMinor, bp: 0, fixed: a.amountMinor };
      if (!best || candidate.value > best.value) best = candidate;
    }
    if (!best) continue;
    percentBp += best.bp;
    fixedMinor += best.fixed;
  }
  return clamp(Math.max(0, base + applyBasisPoints(base, percentBp) + fixedMinor), rule.minimumOfferMinor, rule.maximumOfferMinor);
}
