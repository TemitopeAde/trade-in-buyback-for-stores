import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-settings';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in settings',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'schemaVersion', type: 'NUMBER', displayName: 'Schema version' },
    { key: 'settings', type: 'OBJECT', displayName: 'Settings', objectOptions: { fields: [] } },
    { key: 'disconnected', type: 'BOOLEAN', displayName: 'App disconnected' },
  ],
  displayField: 'instanceId',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }], unique: true },
  ],
  initialData: [],
} satisfies DataCollection;
