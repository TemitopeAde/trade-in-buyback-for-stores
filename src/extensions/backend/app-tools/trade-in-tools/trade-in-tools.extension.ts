import { extensions } from '@wix/astro/builders';
import { APP_TOOL_DEFS } from '../../../../lib/app-tools';

// Aria tools. Declarations live in src/lib/app-tools.ts (shared with the runtime handler in
// service-plugins/trade-in-aria). Schemas are advisory; the handler validates every input.
export default extensions.appTools({
  id: '29b4e61b-afc6-4061-a6f0-67f2f8c8ed05',
  name: 'trade-in-tools',
  tools: APP_TOOL_DEFS.map(({ methodName, displayName, description, requestSchema, responseSchema }) => ({
    methodName,
    displayName,
    description,
    requestSchema,
    responseSchema,
    activated: true,
  })),
});
