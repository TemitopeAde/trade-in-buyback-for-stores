// Full scoped collection IDs: `<app-namespace>/<idSuffix>` (case-sensitive, must match the
// idSuffix in src/extensions/backend/data-collections/*.ts).

const NAMESPACE = '@admin14744/trade-in-buyback-for-stores';

export const COLLECTIONS = {
  tradeIns: `${NAMESPACE}/trade-ins`,
  media: `${NAMESPACE}/trade-in-media`,
  events: `${NAMESPACE}/trade-in-events`,
  rules: `${NAMESPACE}/trade-in-rules`,
  settings: `${NAMESPACE}/trade-in-settings`,
  notifications: `${NAMESPACE}/trade-in-notifications`,
  idempotency: `${NAMESPACE}/idempotency-records`,
  outbox: `${NAMESPACE}/outbox-events`,
  accessTokens: `${NAMESPACE}/trade-in-access-tokens`,
} as const;
