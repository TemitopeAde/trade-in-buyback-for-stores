import { extensions } from '@wix/astro/builders';

export default extensions.dashboardPage({
  id: '66bd4480-0361-4039-8ff3-1c8ebf284082',
  title: 'Trade-ins',
  routePath: '',
  component: './extensions/dashboard/pages/trade-ins/trade-ins.tsx',
  fullPage: false,
  metaData: {
    searchable: true,
    description: 'Review trade-in requests, issue store credit and configure trade-in rules.',
  },
});
