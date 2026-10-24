import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'idempotency-records';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Idempotency records',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'key', type: 'TEXT', displayName: 'Key' },
    { key: 'operation', type: 'TEXT', displayName: 'Operation' },
    { key: 'payloadHash', type: 'TEXT', displayName: 'Payload hash' },
    { key: 'status', type: 'TEXT', displayName: 'Status' },
    { key: 'attemptCount', type: 'NUMBER', displayName: 'Attempt count' },
    { key: 'resultRef', type: 'OBJECT', displayName: 'Result reference', objectOptions: { fields: [] } },
    { key: 'lockedUntil', type: 'DATETIME', displayName: 'Locked until' },
  ],
  displayField: 'key',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'operation' }, { path: 'key' }], unique: true },
  ],
  initialData: [],
} satisfies DataCollection;
