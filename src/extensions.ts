import { app } from '@wix/astro/builders';
import tradeInsPage from './extensions/dashboard/pages/trade-ins/trade-ins.extension.ts';

import dataCollections from './extensions/backend/data-collections/data-collections.extension.ts';

import tradeInForm from './extensions/site/widgets/trade-in-form/trade-in-form.extension.ts';

import tradeInStatus from './extensions/site/widgets/trade-in-status/trade-in-status.extension.ts';

import myTradeIns from './extensions/site/widgets/my-trade-ins/my-trade-ins.extension.ts';

import tradeInProductCta from './extensions/site/plugins/trade-in-product-cta/trade-in-product-cta.extension.ts';

import mediaFileReady from './extensions/backend/events/media-file-ready/media-file-ready.extension.ts';

import mediaFileFailed from './extensions/backend/events/media-file-failed/media-file-failed.extension.ts';

import outboxItemCreated from './extensions/backend/events/outbox-item-created/outbox-item-created.extension.ts';

import emailTransmissionUpdated from './extensions/backend/events/email-transmission-updated/email-transmission-updated.extension.ts';

import tradeInTools from './extensions/backend/app-tools/trade-in-tools/trade-in-tools.extension.ts';

import appRemoved from './extensions/backend/events/app-removed/app-removed.extension.ts';

import appInstalled from './extensions/backend/events/app-installed/app-installed.extension.ts';

import tradeInAria from './extensions/backend/service-plugins/trade-in-aria/trade-in-aria.extension.ts';

export default app()
  .use(tradeInsPage).use(dataCollections).use(tradeInForm).use(tradeInStatus).use(myTradeIns).use(tradeInProductCta).use(mediaFileReady).use(mediaFileFailed).use(outboxItemCreated).use(emailTransmissionUpdated).use(tradeInTools).use(appRemoved).use(appInstalled).use(tradeInAria);
