// Builds the screenshot harness: real app components with the Wix SDK modules swapped for
// local stand-ins (see mocks/). Not part of the app build.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Tailwind scans for dashboard classes from the Vite root, so the root is the repo.
  root: here('../..'),
  publicDir: here('./public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@wix/essentials': here('./mocks/essentials.ts'),
      '@wix/site-window': here('./mocks/site-window.ts'),
      '@wix/site-site': here('./mocks/site-site.ts'),
      '@wix/dashboard': here('./mocks/dashboard.ts'),
      '@wix/editor': here('./mocks/editor.ts'),
    },
  },
  build: { outDir: here('./dist'), emptyOutDir: true, chunkSizeWarningLimit: 10000, rollupOptions: { input: here('./index.html') } },
});
