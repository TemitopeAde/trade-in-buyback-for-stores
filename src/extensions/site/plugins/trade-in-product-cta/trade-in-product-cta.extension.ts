import { extensions } from '@wix/astro/builders'

export default extensions.sitePlugin({
  id: '878529eb-fc6b-410f-ac98-90672c15aac4',
  name: 'Trade-in button',
  marketData: {
    name: 'Trade-in button',
    description: 'Lets shoppers start a trade-in from the product page, with an optional “up to” credit estimate.',
    logoUrl: '{{BASE_URL}}/trade-in-product-cta-logo.svg',
  },
  // Both Stores product page versions (new and old), per Wix docs.
  placements: [
    {
      appDefinitionId: 'a0c68605-c2e7-4c8d-9ea1-767f9770e087',
      widgetId: '6a25b678-53ec-4b37-a190-65fcd1ca1a63',
      slotId: 'product-page-details-2',
    },
    {
      appDefinitionId: '1380b703-ce81-ff05-f115-39571d94dfcd',
      widgetId: '13a94f09-2766-3c40-4a32-8edb5acdd8bc',
      slotId: 'product-page-additional-buttons',
    },
    {
      appDefinitionId: '1380b703-ce81-ff05-f115-39571d94dfcd',
      widgetId: '13a94f09-2766-3c40-4a32-8edb5acdd8bc',
      slotId: 'product-page-details-2',
    },
  ],
  installation: { autoAdd: true },
  tagName: 'trade-in-product-cta',
  element: './extensions/site/plugins/trade-in-product-cta/trade-in-product-cta.tsx',
  settings: './extensions/site/plugins/trade-in-product-cta/trade-in-product-cta.panel.tsx',
});
