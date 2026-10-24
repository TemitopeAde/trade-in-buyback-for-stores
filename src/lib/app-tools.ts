// App Tools (Aria) declarations, shared by the APP_TOOLS extension builder and the tools
// provider handler. Pure data: no runtime imports.

type JsonSchema = Record<string, unknown>;
export type ToolDef = { methodName: string; displayName: string; description: string; requestSchema: JsonSchema; responseSchema: JsonSchema; consequential: boolean };

const reference = { type: 'string', description: 'Trade-in reference, e.g. TI-7KQ4-M2XP.' };
const confirmation = {
  confirmationCode: { type: 'string', description: 'Leave empty on the first call. The first call returns a summary and a confirmationCode; show the summary to the user and only call again with that code after they explicitly confirm.' },
};
const out = { type: 'object', additionalProperties: true };

const CONFIRM_NOTE = ' This changes data: the first call only returns a summary and a confirmation code — ask the user to confirm before calling again with the code.';

export const APP_TOOL_DEFS: ToolDef[] = [
  {
    methodName: 'search-trade-ins', displayName: 'Search trade-ins', consequential: false,
    description: 'Searches the store’s trade-in requests by reference, customer email or name, product, or status group. Use when the user asks to find, list or look up trade-ins, e.g. “show pending trade-ins” or “find Ana’s trade-in”. Returns up to 20 matches with reference, customer, product, status and estimated offer.',
    requestSchema: { type: 'object', properties: { query: { type: 'string' }, statusGroup: { type: 'string', enum: ['needs_review', 'awaiting_handoff', 'in_inspection', 'awaiting_customer', 'credit', 'closed'] } } },
    responseSchema: out,
  },
  {
    methodName: 'get-trade-in', displayName: 'Get trade-in details', consequential: false,
    description: 'Returns full details of one trade-in: customer, item, condition answers, estimate breakdown, hand-off, gift card status, available actions and timeline. Use when the user asks about a specific trade-in by reference. Requires the reference.',
    requestSchema: { type: 'object', properties: { reference }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'summarize-trade-in', displayName: 'Summarize trade-in', consequential: false,
    description: 'Gives a short plain-language summary of a trade-in and its history (what was submitted, current status, what happened and what is next). Use when the user asks “what’s going on with” a trade-in. Requires the reference.',
    requestSchema: { type: 'object', properties: { reference }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'workload-summary', displayName: 'Trade-in workload', consequential: false,
    description: 'Summarizes the current trade-in workload: how many requests need review, await hand-off, are being inspected, await the customer, or are in credit. Use for “what needs my attention”, “how many pending trade-ins”, or daily overviews.',
    requestSchema: { type: 'object', properties: {} }, responseSchema: out,
  },
  {
    methodName: 'explain-estimate', displayName: 'Explain estimate', consequential: false,
    description: 'Explains how a trade-in’s estimated offer was calculated: product price, payout percentage, each condition adjustment and any minimum/maximum clamp, plus the rule used. Use when the user asks why an offer is a certain amount. Requires the reference.',
    requestSchema: { type: 'object', properties: { reference }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'recommend-decision', displayName: 'Review recommendation', consequential: false,
    description: 'Prepares an advisory review of a pending trade-in: checks evidence, answers, value and history and suggests whether to approve or look closer. It never changes anything; the merchant decides. Use when the user asks “should I approve this?”. Requires the reference.',
    requestSchema: { type: 'object', properties: { reference }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'approve-trade-in', displayName: 'Approve trade-in', consequential: true,
    description: 'Approves a submitted or under-review trade-in so the customer receives hand-off instructions. Use when the user asks to approve or accept a trade-in. Requires the reference.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, ...confirmation }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'reject-trade-in', displayName: 'Reject trade-in', consequential: true,
    description: 'Rejects a submitted or under-review trade-in with a reason that is shown to the customer. Use when the user asks to reject or decline a trade-in. Requires the reference and a reason.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, reason: { type: 'string' }, ...confirmation }, required: ['reference', 'reason'] }, responseSchema: out,
  },
  {
    methodName: 'mark-received', displayName: 'Mark item received', consequential: true,
    description: 'Marks an approved trade-in item as received in store or by mail. Use when the user says the item arrived. Requires the reference.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, ...confirmation }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'record-inspection', displayName: 'Record inspection', consequential: true,
    description: 'Records the inspection result of a received item: start inspection, confirm the estimated value (this issues store credit as a Wix gift card), or reject after inspection with a reason. Use when the user reports inspection results. Requires the reference and outcome; credit is issued only for outcome confirm_value.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, outcome: { type: 'string', enum: ['start', 'confirm_value', 'reject'] }, notes: { type: 'string' }, reason: { type: 'string' }, ...confirmation }, required: ['reference', 'outcome'] },
    responseSchema: out,
  },
  {
    methodName: 'send-revised-offer', displayName: 'Send revised offer', consequential: true,
    description: 'After inspection, sends the customer a revised offer amount with a reason; the customer accepts or declines on their status page. Use when the user wants to offer a different amount. Requires the reference, the new amount (in the trade-in’s currency, e.g. "35.00") and a reason.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, amount: { type: 'string' }, reason: { type: 'string' }, ...confirmation }, required: ['reference', 'amount', 'reason'] },
    responseSchema: out,
  },
  {
    methodName: 'gift-card-status', displayName: 'Gift card status', consequential: false,
    description: 'Shows whether store credit was issued for a trade-in, its amount and gift card status (issued, failed, needs reconciliation). Never returns gift card codes. Requires the reference.',
    requestSchema: { type: 'object', properties: { reference }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'reconcile-gift-card', displayName: 'Retry gift card', consequential: true,
    description: 'Retries or reconciles store credit issuance for a trade-in whose gift card failed or needs reconciliation. Safe: the same gift card is reused so credit is never duplicated. Requires the reference.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, ...confirmation }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'create-resale-draft', displayName: 'Create resale draft', consequential: true,
    description: 'Creates a hidden draft product in Wix Stores for an accepted trade-in item so the merchant can price and publish it. It is never published automatically. Requires the reference.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { reference, ...confirmation }, required: ['reference'] }, responseSchema: out,
  },
  {
    methodName: 'list-rules', displayName: 'List trade-in rules', consequential: false,
    description: 'Lists the trade-in rules: which products they apply to, payout percentage, condition questions and evidence requirements, and how offers are calculated. Use when the user asks how pricing or eligibility is configured.',
    requestSchema: { type: 'object', properties: {} }, responseSchema: out,
  },
  {
    methodName: 'set-rule-enabled', displayName: 'Enable or disable a rule', consequential: true,
    description: 'Enables or disables a trade-in rule by name, e.g. to pause trade-ins for a category. Use when the user asks to pause, stop, resume or enable trade-ins for something. Requires the rule name and enabled true/false.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { ruleName: { type: 'string' }, enabled: { type: 'boolean' }, ...confirmation }, required: ['ruleName', 'enabled'] }, responseSchema: out,
  },
  {
    methodName: 'get-notification-prefs', displayName: 'Notification settings', consequential: false,
    description: 'Shows which trade-in emails are sent to the team and to customers, and how many team recipients are configured. Use when the user asks about trade-in notifications or emails.',
    requestSchema: { type: 'object', properties: {} }, responseSchema: out,
  },
  {
    methodName: 'set-notification-pref', displayName: 'Change a notification', consequential: true,
    description: 'Turns one trade-in email on or off for the team or customers, e.g. “stop emailing me about new trade-ins”. Requires audience (merchant or customer), the event name from get-notification-prefs, and enabled true/false.' + CONFIRM_NOTE,
    requestSchema: { type: 'object', properties: { audience: { type: 'string', enum: ['merchant', 'customer'] }, event: { type: 'string' }, enabled: { type: 'boolean' }, ...confirmation }, required: ['audience', 'event', 'enabled'] },
    responseSchema: out,
  },
  {
    methodName: 'trade-in-report', displayName: 'Trade-in report', consequential: false,
    description: 'Reports trade-in results for the last N days (default 30): requests submitted, approved, rejected, conversion to credit, credit issued and redeemed, average offer, and resale drafts. Use for reports, performance questions or “how are trade-ins doing”.',
    requestSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365 } } }, responseSchema: out,
  },
];
