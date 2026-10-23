import { extensions } from '@wix/astro/builders';

export default extensions.dashboardPage({
  id: '66bd4480-0361-4039-8ff3-1c8ebf284082',
  title: 'My Page',
  routePath: '',
  component: './extensions/dashboard/pages/my-page/my-page.tsx',
  fullPage: false,
  metaData: {
    searchable: true,
    description: 'Manage My Page in your dashboard.',
  },
});
