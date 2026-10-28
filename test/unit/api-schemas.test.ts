import { describe, expect, it } from 'vitest';
import { myTradeInsRequest } from '../../src/lib/schemas/api';

// GET routes parse Object.fromEntries(url.searchParams), so every value is a string.
const query = (qs: string) => Object.fromEntries(new URLSearchParams(qs));

describe('myTradeInsRequest', () => {
  it('accepts the cursor as a query-string number', () => {
    expect(myTradeInsRequest.parse(query('cursor=0'))).toEqual({ cursor: 0 });
    expect(myTradeInsRequest.parse(query('cursor=20'))).toEqual({ cursor: 20 });
  });

  it('defaults a missing cursor to 0', () => {
    expect(myTradeInsRequest.parse(query(''))).toEqual({ cursor: 0 });
  });

  it('rejects non-numeric, fractional and out-of-range cursors', () => {
    for (const qs of ['cursor=abc', 'cursor=1.5', 'cursor=-1', 'cursor=10001']) {
      expect(myTradeInsRequest.safeParse(query(qs)).success).toBe(false);
    }
  });
});
