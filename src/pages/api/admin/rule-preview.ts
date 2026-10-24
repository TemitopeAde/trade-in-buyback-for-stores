import { calculateOffer, maximumPossibleOffer } from '../../../lib/offer';
import { rulePreviewRequest } from '../../../lib/schemas/admin';
import { rules } from '../../../server/container';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';

// POST /api/admin/rule-preview — explains what a (draft) rule would offer for a sample price.
export const POST = route(rulePreviewRequest, async (ctx, { rule, priceMinor, currency, answers }) => {
  requireMerchant(ctx);
  const draft = { ...rules.validate(rule), _id: 'preview', instanceId: ctx.instanceId, version: 0 };
  return {
    result: calculateOffer({ rule: draft, priceMinor, currency: currency.toUpperCase(), answers, partial: true }),
    upToMinor: maximumPossibleOffer(draft, priceMinor),
  };
});
