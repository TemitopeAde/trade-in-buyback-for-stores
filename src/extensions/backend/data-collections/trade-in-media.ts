import type { DataCollection } from '@wix/astro/builders'

export const collectionIdSuffix = 'trade-in-media';

export default {
  idSuffix: collectionIdSuffix,
  displayName: 'Trade-in media',
  fields: [
    { key: 'instanceId', type: 'TEXT', displayName: 'Instance ID' },
    { key: 'tradeInId', type: 'TEXT', displayName: 'Trade-in ID' },
    { key: 'uploadSessionId', type: 'TEXT', displayName: 'Upload session ID' },
    { key: 'mediaType', type: 'TEXT', displayName: 'Media type' },
    { key: 'mediaManagerFileId', type: 'TEXT', displayName: 'Media Manager file ID' },
    { key: 'readyStatus', type: 'TEXT', displayName: 'Ready status' },
    { key: 'fileSize', type: 'NUMBER', displayName: 'File size (bytes)' },
    { key: 'mimeType', type: 'TEXT', displayName: 'MIME type' },
    { key: 'durationSeconds', type: 'NUMBER', displayName: 'Duration (seconds)' },
    { key: 'deleteAfter', type: 'DATETIME', displayName: 'Delete after' },
    { key: 'deletedAt', type: 'DATETIME', displayName: 'Deleted at' },
    { key: 'supersededAt', type: 'DATETIME', displayName: 'Superseded at' },
  ],
  displayField: 'mediaManagerFileId',
  dataPermissions: {
    itemInsert: 'PRIVILEGED',
    itemRead: 'PRIVILEGED',
    itemRemove: 'PRIVILEGED',
    itemUpdate: 'PRIVILEGED',
  },
  indexes: [
    { fields: [{ path: 'instanceId' }, { path: 'tradeInId' }] },
    { fields: [{ path: 'mediaManagerFileId' }] },
    { fields: [{ path: 'uploadSessionId' }] },
  ],
  initialData: [],
} satisfies DataCollection;
