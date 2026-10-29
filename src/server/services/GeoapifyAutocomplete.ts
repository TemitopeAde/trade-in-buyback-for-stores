import { AppError } from '../errors';

// Street-address suggestions for the dashboard's hand-off address fields, via Geoapify Address
// Autocomplete (https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), as in our
// distance-shipping app. Called only from the backend so the key never reaches the browser.
// Suggestions only prefill form fields; the query text is never logged or stored.

export type AddressSuggestion = {
  formatted: string;
  line1: string;
  city: string;
  /** State / province code, uppercase (e.g. "TX"). */
  subdivision: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string;
};

type GeoapifyResponse = {
  results?: {
    formatted?: string;
    address_line1?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    state_code?: string;
    postcode?: string;
    country_code?: string;
    result_type?: string;
  }[];
};

export async function suggestAddresses(
  text: string,
  apiKey: string,
  opts: { country: string; lang?: string; limit?: number; signal?: AbortSignal },
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ text, format: 'json', limit: String(opts.limit ?? 5), apiKey });
  // Always restricted to the country the merchant picked.
  params.set('filter', `countrycode:${opts.country.toLowerCase()}`);
  if (opts.lang && /^[a-z]{2}$/.test(opts.lang)) params.set('lang', opts.lang);

  const res = await fetchImpl(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: opts.signal });
  if (res.status === 429) throw new AppError('rate_limited', 'geoapify rate limited');
  if (!res.ok) throw new AppError('unavailable', `geoapify HTTP ${res.status}`);
  const body = (await res.json()) as GeoapifyResponse;

  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const r of body.results ?? []) {
    const street = r.housenumber && r.street ? `${r.housenumber} ${r.street}` : (r.street ?? '');
    const s: AddressSuggestion = {
      formatted: r.formatted ?? '',
      line1: r.address_line1 && (r.result_type === 'building' || r.result_type === 'street') ? r.address_line1 : street,
      city: r.city ?? r.town ?? r.village ?? '',
      subdivision: (r.state_code ?? '').toUpperCase(),
      postalCode: r.postcode ?? '',
      country: (r.country_code ?? '').toUpperCase(),
    };
    if (!s.formatted || seen.has(s.formatted)) continue;
    seen.add(s.formatted);
    out.push(s);
  }
  return out;
}
