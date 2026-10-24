import { extensions } from '@wix/astro/builders'

export default extensions.customElement({
  id: 'db5c4e26-2ff7-4b3c-82c9-148f9fec7d71',
  name: 'Trade-in Status',
  width: {
    defaultWidth: 640,
    allowStretch: true
  },
  height: {
    defaultHeight: 700
  },
  installation: {
    autoAdd: false
  },
  presets: [
    {
      id: 'f05da268-197e-4910-8a8b-0d108db6d23a',
      name: 'default',
      thumbnailUrl: '{{BASE_URL}}/trade-in-status-thumbnail.png',
    },
  ],
  
  tagName: 'trade-in-status',
  element: './extensions/site/widgets/trade-in-status/trade-in-status.tsx',
  settings: './extensions/site/widgets/trade-in-status/trade-in-status.panel.tsx',
});
