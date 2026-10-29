// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import wix from '@wix/astro';
import react from "@astrojs/react";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";
import tailwindcss from "@tailwindcss/vite";

// ENVIRONMENT="development" in .env.local gives every site full plan access under `wix dev`
// (see src/server/environment.ts). Backend extensions run in Wix's own Vite servers, where
// `astro:env` isn't available, so the value is shared through process.env instead.
const localEnv = loadEnv('development', process.cwd(), '');
if (localEnv.ENVIRONMENT && !process.env.ENVIRONMENT) process.env.ENVIRONMENT = localEnv.ENVIRONMENT;

export default defineConfig({
  output: "server",
  adapter: wixHostingAdapter(),
  integrations: [wix(), react()],
  image: { domains: ["static.wixstatic.com"] },
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  env: {
    schema: {
      // Geoapify key for dashboard address suggestions (/api/admin/address-suggest only). Set with
      // `wix env set`; only Astro routes may import it (backend extensions can't use astro:env).
      AUTOCOMPLETE_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  // Tailwind is only imported by the merchant dashboard stylesheet; widgets use their own scoped CSS.
  vite: { plugins: [tailwindcss()], 
    server: {
      cors: true
  } },
});
