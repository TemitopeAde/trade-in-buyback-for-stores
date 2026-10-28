import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` header.
    // Wix SDK modules are mocked per test file only; app code never ships mocks.
  },
});
