import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-events';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in events',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'tradeInId', type: 'TEXT', displayName: 'Trade-in ID' },
    { key: 'eventType', type: 'TEXT', displayName: 'Event type' },
    { key: 'fromStatus', type: 'TEXT', displayName: 'From status' },
    { key: 'toStatus', type: 'TEXT', displayName: 'To status' },
    { key: 'actorType', type: 'TEXT', displayName: 'Actor type' },
    { key: 'actorId', type: 'TEXT', displayName: 'Actor ID' },
    { key: 'reason', type: 'TEXT', displayName: 'Reason' },
    { key: 'metadataSanitized', type: 'OBJECT', displayName: 'Metadata', objectOptions: { fields: [] } },
    { key: 'idempotencyKey', type: 'TEXT', displayName: 'Idempotency key' },
  ],
  displayField: 'eventType',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'tradeInId' }, { path: '_createdDate', order: 'ASC' }] },
    { fields: [{ path: 'instanceId' }, { path: '_createdDate', order: 'DESC' }] },
  ],
  initialData: [],
} satisfies DataCollection;
