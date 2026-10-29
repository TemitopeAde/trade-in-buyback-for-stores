// A structured postal address for hand-off locations. The dashboard fills it from the country,
// state and city dropdowns (CountriesNow) and street suggestions (Geoapify); the server turns it
// into the display text customers see (`formatAddress`).

export type PostalAddress = {
  /** ISO 3166-1 alpha-2, uppercase. */
  country: string;
  line1: string;
  line2: string;
  city: string;
  /** State / province / region code (e.g. "TX"), or its name where the country has no codes. */
  subdivision: string;
  postalCode: string;
};

export const EMPTY_ADDRESS: PostalAddress = { country: '', line1: '', line2: '', city: '', subdivision: '', postalCode: '' };

/** True once there's enough to send someone there: a country and a street line. */
export function isCompleteAddress(a: PostalAddress | undefined): a is PostalAddress {
  return !!a && /^[A-Z]{2}$/.test(a.country) && a.line1.trim().length > 0;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Multi-line display text: street, line 2, "City, STATE 12345", country. Empty parts are skipped.
 * Customers see this in the form, on the status page and in emails.
 */
export function formatAddress(a: PostalAddress, locale = 'en'): string {
  const locality = [a.city.trim(), [a.subdivision.trim(), a.postalCode.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.line1.trim(), a.line2.trim(), locality, a.country ? countryName(a.country, locale) : '']
    .filter(Boolean)
    .join('\n');
}
