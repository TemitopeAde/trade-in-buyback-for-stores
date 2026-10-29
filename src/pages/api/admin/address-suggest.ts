import { AUTOCOMPLETE_API_KEY } from 'astro:env/server';
import { z } from 'zod';
import { AppError } from '../../../server/errors';
import { route } from '../../../server/http';
import { requireMerchant } from '../../../server/services/AuthorizationService';
import { suggestAddresses } from '../../../server/services/GeoapifyAutocomplete';

// GET /api/admin/address-suggest?text=&country=&lang= — street suggestions for hand-off addresses.
// Imports astro:env directly: this route runs in Astro's server, never in a backend extension.
const query = z.object({
  text: z.string().trim().min(3).max(200),
  country: z.string().regex(/^[A-Z]{2}$/),
  lang: z.string().regex(/^[a-z]{2}$/).optional(),
});

export const GET = route(query, async (ctx, q) => {
  requireMerchant(ctx);
  if (!AUTOCOMPLETE_API_KEY) throw new AppError('unavailable', 'autocomplete not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    return { suggestions: await suggestAddresses(q.text, AUTOCOMPLETE_API_KEY, { country: q.country, lang: q.lang, signal: controller.signal }) };
  } catch (err) {
    throw err instanceof AppError ? err : new AppError('unavailable', 'autocomplete failed');
  } finally {
    clearTimeout(timer);
  }
}, { rateLimitPerMinute: 60 });
