import { extensions } from '@wix/astro/builders'

export default extensions.customElement({
  id: 'f0bf46d9-02e4-4de1-a6d4-1f78653eccec',
  name: 'Trade-in Form',
  width: {
    defaultWidth: 720,
    allowStretch: true
  },
  height: {
    defaultHeight: 900
  },
  installation: {
    autoAdd: false
  },
  presets: [
    {
      id: 'c2b44518-8a3d-454c-9a85-8796d7da9489',
      name: 'default',
      thumbnailUrl: '{{BASE_URL}}/trade-in-form-thumbnail.png',
    },
  ],
  
  tagName: 'trade-in-form',
  element: './extensions/site/widgets/trade-in-form/trade-in-form.tsx',
  settings: './extensions/site/widgets/trade-in-form/trade-in-form.panel.tsx',
});
