import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-rules';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in rules',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'name', type: 'TEXT', displayName: 'Name' },
    { key: 'scope', type: 'TEXT', displayName: 'Scope (category/product)' },
    { key: 'categoryId', type: 'TEXT', displayName: 'Category ID' },
    { key: 'productIds', type: 'ARRAY_STRING', displayName: 'Product IDs' },
    { key: 'payoutPercentage', type: 'NUMBER', displayName: 'Payout percentage' },
    { key: 'conditionQuestions', type: 'OBJECT', displayName: 'Condition questions', objectOptions: { fields: [] } },
    { key: 'minimumOfferMinor', type: 'NUMBER', displayName: 'Minimum offer (minor units)' },
    { key: 'maximumOfferMinor', type: 'NUMBER', displayName: 'Maximum offer (minor units)' },
    { key: 'photoMinimum', type: 'NUMBER', displayName: 'Photo minimum' },
    { key: 'videoMode', type: 'TEXT', displayName: 'Video mode' },
    { key: 'videoMaxSeconds', type: 'NUMBER', displayName: 'Video max seconds' },
    { key: 'priority', type: 'NUMBER', displayName: 'Priority' },
    { key: 'enabled', type: 'BOOLEAN', displayName: 'Enabled' },
    { key: 'version', type: 'NUMBER', displayName: 'Version' },
  ],
  displayField: 'name',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'enabled' }] },
  ],
  initialData: [],
} satisfies DataCollection;
