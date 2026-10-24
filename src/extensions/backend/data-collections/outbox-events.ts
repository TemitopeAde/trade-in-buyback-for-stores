import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'outbox-events';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Outbox events',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'eventType', type: 'TEXT', displayName: 'Event type' },
    { key: 'tradeInId', type: 'TEXT', displayName: 'Trade-in ID' },
    { key: 'payload', type: 'OBJECT', displayName: 'Payload', objectOptions: { fields: [] } },
    { key: 'status', type: 'TEXT', displayName: 'Status' },
    { key: 'attemptCount', type: 'NUMBER', displayName: 'Attempt count' },
    { key: 'nextAttemptAt', type: 'DATETIME', displayName: 'Next attempt at' },
    { key: 'lastError', type: 'TEXT', displayName: 'Last error' },
    { key: 'dedupeKey', type: 'TEXT', displayName: 'Dedupe key' },
    { key: 'revivals', type: 'NUMBER', displayName: 'Manual revivals' },
  ],
  displayField: 'eventType',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'status' }, { path: 'nextAttemptAt' }] },
    { fields: [{ path: 'instanceId' }, { path: 'dedupeKey' }], unique: true },
  ],
  initialData: [],
} satisfies DataCollection;
