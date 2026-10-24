import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-notifications';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in notifications',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'tradeInId', type: 'TEXT', displayName: 'Trade-in ID' },
    { key: 'eventId', type: 'TEXT', displayName: 'Event ID' },
    { key: 'eventType', type: 'TEXT', displayName: 'Event type' },
    { key: 'recipientType', type: 'TEXT', displayName: 'Recipient type' },
    { key: 'recipientHash', type: 'TEXT', displayName: 'Recipient hash' },
    { key: 'providerTransmissionId', type: 'TEXT', displayName: 'Transmission ID' },
    { key: 'status', type: 'TEXT', displayName: 'Status' },
    { key: 'attemptCount', type: 'NUMBER', displayName: 'Attempt count' },
    { key: 'lastErrorCode', type: 'TEXT', displayName: 'Last error code' },
    { key: 'recipientFailures', type: 'OBJECT', displayName: 'Recipient failures', objectOptions: { fields: [] } },
    { key: 'nextAttemptAt', type: 'DATETIME', displayName: 'Next attempt at' },
    { key: 'sentAt', type: 'DATETIME', displayName: 'Sent at' },
  ],
  displayField: 'eventType',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: '_createdDate', order: 'DESC' }] },
    { fields: [{ path: 'status' }, { path: 'nextAttemptAt' }] },
    { fields: [{ path: 'instanceId' }, { path: 'eventId' }, { path: 'recipientType' }], unique: true },
  ],
  initialData: [],
} satisfies DataCollection;
