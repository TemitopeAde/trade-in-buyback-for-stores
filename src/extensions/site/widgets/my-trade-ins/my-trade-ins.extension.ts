import { extensions } from '@wix/astro/builders'

export default extensions.customElement({
  id: '36b0750d-7012-42f0-9825-cb64cff3eb14',
  name: 'My Trade-ins',
  width: {
    defaultWidth: 640,
    allowStretch: true
  },
  height: {
    defaultHeight: 500
  },
  installation: {
    autoAdd: false
  },
  presets: [
    {
      id: '69edac29-9281-4675-8975-19b2338a0c24',
      name: 'default',
      thumbnailUrl: '{{BASE_URL}}/my-trade-ins-thumbnail.png',
    },
  ],
  
  tagName: 'my-trade-ins',
  element: './extensions/site/widgets/my-trade-ins/my-trade-ins.tsx',
  settings: './extensions/site/widgets/my-trade-ins/my-trade-ins.panel.tsx',
});
