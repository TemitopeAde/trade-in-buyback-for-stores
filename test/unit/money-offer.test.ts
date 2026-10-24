import { describe, expect, it } from 'vitest';
import { applyBasisPoints, toDecimalString, toMinor } from '../../src/lib/money';
import { calculateOffer, maximumPossibleOffer, selectRule } from '../../src/lib/offer';
import type { Rule } from '../../src/lib/schemas/domain';

const rule = (over: Partial<Rule> = {}): Rule => ({
  _id: 'r1',
  instanceId: 'i1',
  version: 1,
  name: 'Phones',
  scope: 'all',
  productIds: [],
  payoutPercentage: 40,
  conditionQuestions: [
    {
      id: 'screen',
      label: 'Screen',
      required: true,
      options: [
        { id: 'perfect', label: 'Perfect', adjustment: { kind: 'percent', basisPoints: 0 } },
        { id: 'scratched', label: 'Scratched', adjustment: { kind: 'percent', basisPoints: -2500 } },
        { id: 'cracked', label: 'Cracked', adjustment: { kind: 'reject' } },
      ],
    },
    {
      id: 'box',
      label: 'Original box',
      required: false,
      options: [
        { id: 'yes', label: 'Yes', adjustment: { kind: 'fixed', amountMinor: 500 } },
        { id: 'no', label: 'No', adjustment: { kind: 'fixed', amountMinor: 0 } },
      ],
    },
  ],
  photoMinimum: 2,
  videoMode: 'off',
  videoMaxSeconds: 60,
  priority: 0,
  enabled: true,
  ...over,
});

describe('money', () => {
  it('parses decimal strings to minor units without float drift', () => {
    expect(toMinor('19.99', 'USD')).toBe(1999);
    expect(toMinor('0.1', 'USD')).toBe(10);
    expect(toMinor('1000', 'JPY')).toBe(1000);
    expect(toMinor('1.2345', 'KWD')).toBe(1235); // 3-decimal currency, half-up
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30);
  });
  it('formats minor units for Wix APIs', () => {
    expect(toDecimalString(1999, 'USD')).toBe('19.99');
    expect(toDecimalString(5, 'USD')).toBe('0.05');
    expect(toDecimalString(1000, 'JPY')).toBe('1000');
  });
  it('applies basis points with half-up rounding', () => {
    expect(applyBasisPoints(999, 4000)).toBe(400); // 399.6 → 400
    expect(applyBasisPoints(1001, 5000)).toBe(501); // 500.5 → 501
    expect(applyBasisPoints(1000, -2500)).toBe(-250);
  });
  it('rejects non-integer money', () => {
    expect(() => toDecimalString(1.5, 'USD')).toThrow();
  });
});

describe('offer calculation', () => {
  it('computes base × payout, then percent, then fixed', () => {
    const r = calculateOffer({ rule: rule(), priceMinor: 100_00, currency: 'USD', answers: { screen: 'scratched', box: 'yes' } });
    expect(r.eligible).toBe(true);
    if (!r.eligible) return;
    expect(r.breakdown.baseOfferMinor).toBe(40_00);
    expect(r.breakdown.offerMinor).toBe(40_00 - 10_00 + 5_00);
  });

  it('rejects when an answer is a reject option', () => {
    const r = calculateOffer({ rule: rule(), priceMinor: 100_00, currency: 'USD', answers: { screen: 'cracked' } });
    expect(r).toMatchObject({ eligible: false, reason: 'rejected_by_answer' });
  });

  it('requires required answers unless partial', () => {
    expect(calculateOffer({ rule: rule(), priceMinor: 100_00, currency: 'USD', answers: {} })).toMatchObject({ eligible: false, reason: 'missing_answers' });
    expect(calculateOffer({ rule: rule(), priceMinor: 100_00, currency: 'USD', answers: {}, partial: true }).eligible).toBe(true);
  });

  it('rejects unknown questions and options (untrusted client input)', () => {
    expect(calculateOffer({ rule: rule(), priceMinor: 100, currency: 'USD', answers: { hacked: 'x' } })).toMatchObject({ reason: 'invalid_answer' });
    expect(calculateOffer({ rule: rule(), priceMinor: 100, currency: 'USD', answers: { screen: 'nope' } })).toMatchObject({ reason: 'invalid_answer' });
  });

  it('clamps to minimum and maximum after adjustments, never below zero first', () => {
    const r1 = calculateOffer({ rule: rule({ minimumOfferMinor: 50_00 }), priceMinor: 100_00, currency: 'USD', answers: { screen: 'perfect' } });
    expect(r1.eligible && r1.breakdown).toMatchObject({ offerMinor: 50_00, clampedTo: 'minimum', beforeClampMinor: 40_00 });
    const r2 = calculateOffer({ rule: rule({ maximumOfferMinor: 30_00 }), priceMinor: 100_00, currency: 'USD', answers: { screen: 'perfect', box: 'yes' } });
    expect(r2.eligible && r2.breakdown).toMatchObject({ offerMinor: 30_00, clampedTo: 'maximum' });
    const harsh = rule({
      conditionQuestions: [{ id: 'q', label: 'Q', required: true, options: [
        { id: 'a', label: 'A', adjustment: { kind: 'fixed', amountMinor: -999_00 } },
        { id: 'b', label: 'B', adjustment: { kind: 'fixed', amountMinor: 0 } },
      ] }],
    });
    const r3 = calculateOffer({ rule: harsh, priceMinor: 100_00, currency: 'USD', answers: { q: 'a' } });
    expect(r3.eligible && r3.breakdown.offerMinor).toBe(0);
  });

  it('computes the best-case "up to" amount', () => {
    expect(maximumPossibleOffer(rule(), 100_00)).toBe(45_00);
  });

  it('selects the most specific enabled rule', () => {
    const all = rule({ _id: 'all' });
    const cat = rule({ _id: 'cat', scope: 'category', categoryId: 'c1' });
    const prod = rule({ _id: 'prod', scope: 'product', productIds: ['p1'] });
    const disabled = rule({ _id: 'off', scope: 'product', productIds: ['p1'], enabled: false, priority: 99 });
    expect(selectRule([all, cat, prod, disabled], { productId: 'p1', categoryIds: ['c1'] })?._id).toBe('prod');
    expect(selectRule([all, cat], { productId: 'p2', categoryIds: ['c1'] })?._id).toBe('cat');
    expect(selectRule([cat], { productId: 'p2', categoryIds: [] })).toBeUndefined();
  });
});
