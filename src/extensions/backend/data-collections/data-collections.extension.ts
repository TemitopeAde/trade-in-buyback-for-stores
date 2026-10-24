import { extensions } from '@wix/astro/builders'

import tradeInsCollection from './trade-ins';

import tradeInMediaCollection from './trade-in-media';

import tradeInEventsCollection from './trade-in-events';

import tradeInRulesCollection from './trade-in-rules';

import tradeInSettingsCollection from './trade-in-settings';

import tradeInNotificationsCollection from './trade-in-notifications';

import idempotencyRecordsCollection from './idempotency-records';

import outboxEventsCollection from './outbox-events';

import tradeInAccessTokensCollection from './trade-in-access-tokens';

export default extensions.dataCollections({
  id: '1925a06a-062a-4adf-a19c-f25ed4721b1c',
  name: 'Data Collections',
  collections: [
    tradeInsCollection,
    tradeInMediaCollection,
    tradeInEventsCollection,
    tradeInRulesCollection,
    tradeInSettingsCollection,
    tradeInNotificationsCollection,
    idempotencyRecordsCollection,
    outboxEventsCollection,
    tradeInAccessTokensCollection
  ],
});
