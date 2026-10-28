import { afterEach, describe, expect, it } from 'vitest';
import { isDevelopment } from '../../src/server/environment';

describe('isDevelopment', () => {
  const original = process.env.ENVIRONMENT;
  afterEach(() => { if (original === undefined) delete process.env.ENVIRONMENT; else process.env.ENVIRONMENT = original; });

  it('is on only when ENVIRONMENT is "development" in a dev server', () => {
    process.env.ENVIRONMENT = 'development';
    expect(isDevelopment()).toBe(import.meta.env.DEV);
    process.env.ENVIRONMENT = 'production';
    expect(isDevelopment()).toBe(false);
    delete process.env.ENVIRONMENT;
    expect(isDevelopment()).toBe(false);
  });
});
