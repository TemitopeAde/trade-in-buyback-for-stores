// Canonical trade-in lifecycle. Persisted values are these enums; labels are localized elsewhere.
// The server (TradeInLifecycleService) is the only authority that applies transitions;
// UIs import this table only to decide which actions to offer.

export const TRADE_IN_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'in_transit',
  'received',
  'inspection',
  'revised_offer_pending',
  'revised_offer_accepted',
  'revised_offer_declined',
  'credit_pending',
  'credit_issued',
  'return_pending',
  'closed',
  'cancelled',
] as const;
export type TradeInStatus = (typeof TRADE_IN_STATUSES)[number];

export const TERMINAL_STATUSES: readonly TradeInStatus[] = ['closed', 'cancelled'];

export type ActorType = 'merchant' | 'customer' | 'system' | 'assistant';

export const TRADE_IN_ACTIONS = [
  'start_review',
  'approve',
  'reject',
  'cancel',
  'mark_in_transit',
  'receive',
  'start_inspection',
  'confirm_value',
  'send_revised_offer',
  'reject_after_inspection',
  'accept_revised_offer',
  'decline_revised_offer',
  'mark_credit_issued',
  'mark_returned',
  'close',
] as const;
export type TradeInAction = (typeof TRADE_IN_ACTIONS)[number];

type TransitionRule = {
  from: readonly TradeInStatus[];
  to: TradeInStatus;
  actors: readonly ActorType[];
  requiresReason?: boolean;
  /** Changes money owed to the customer; the server must recompute/validate value. */
  valueChanging?: boolean;
};

const STAFF: readonly ActorType[] = ['merchant', 'assistant'];

export const TRANSITIONS: Record<TradeInAction, TransitionRule> = {
  start_review: { from: ['submitted'], to: 'under_review', actors: STAFF },
  approve: { from: ['submitted', 'under_review'], to: 'approved', actors: STAFF },
  reject: { from: ['submitted', 'under_review'], to: 'rejected', actors: STAFF, requiresReason: true },
  cancel: { from: ['submitted', 'under_review', 'approved', 'in_transit'], to: 'cancelled', actors: ['customer', 'merchant'] },
  mark_in_transit: { from: ['approved'], to: 'in_transit', actors: ['customer', 'merchant'] },
  receive: { from: ['approved', 'in_transit'], to: 'received', actors: STAFF },
  start_inspection: { from: ['received'], to: 'inspection', actors: STAFF },
  confirm_value: { from: ['inspection'], to: 'credit_pending', actors: STAFF, valueChanging: true },
  send_revised_offer: { from: ['inspection'], to: 'revised_offer_pending', actors: STAFF, requiresReason: true, valueChanging: true },
  // Item failed inspection outright: send it back without an offer.
  reject_after_inspection: { from: ['inspection'], to: 'return_pending', actors: STAFF, requiresReason: true },
  // A merchant may record a response the customer gave in store/by phone.
  accept_revised_offer: { from: ['revised_offer_pending'], to: 'revised_offer_accepted', actors: ['customer', 'merchant'] },
  decline_revised_offer: { from: ['revised_offer_pending'], to: 'revised_offer_declined', actors: ['customer', 'merchant', 'system'] },
  // Only the gift-card service moves credit_pending forward, never a UI button directly.
  mark_credit_issued: { from: ['credit_pending'], to: 'credit_issued', actors: ['system'] },
  mark_returned: { from: ['return_pending'], to: 'closed', actors: STAFF },
  close: { from: ['credit_issued', 'rejected'], to: 'closed', actors: STAFF },
};

/** Statuses the system enters automatically right after another transition. */
export const AUTO_FOLLOW_UPS: Partial<Record<TradeInStatus, TradeInStatus>> = {
  revised_offer_accepted: 'credit_pending',
  revised_offer_declined: 'return_pending',
};

export function canTransition(action: TradeInAction, from: TradeInStatus, actor: ActorType): boolean {
  const rule = TRANSITIONS[action];
  return rule.from.includes(from) && rule.actors.includes(actor);
}

export function availableActions(status: TradeInStatus, actor: ActorType): TradeInAction[] {
  return TRADE_IN_ACTIONS.filter((a) => canTransition(a, status, actor));
}

export function isTerminal(status: TradeInStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses after which no further media may be needed; used for retention scheduling. */
export function isClosedForRetention(status: TradeInStatus): boolean {
  return status === 'closed' || status === 'cancelled';
}
