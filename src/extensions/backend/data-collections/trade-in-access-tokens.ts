import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-access-tokens';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in access tokens',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'tradeInId', type: 'TEXT', displayName: 'Trade-in ID' },
    { key: 'tokenHash', type: 'TEXT', displayName: 'Token hash' },
    { key: 'purpose', type: 'TEXT', displayName: 'Purpose' },
    { key: 'expiresAt', type: 'DATETIME', displayName: 'Expires at' },
    { key: 'revokedAt', type: 'DATETIME', displayName: 'Revoked at' },
  ],
  displayField: 'purpose',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'tokenHash' }], unique: true },
    { fields: [{ path: 'instanceId' }, { path: 'tradeInId' }] },
  ],
  initialData: [],
} satisfies DataCollection;
