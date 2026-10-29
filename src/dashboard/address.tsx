import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { EMPTY_ADDRESS, type PostalAddress } from '../lib/location/address';
import {
  fallbackCountries,
  findState,
  loadCities,
  loadCountries,
  loadStates,
  type CountryOption,
  type StateOption,
} from '../lib/location/countries-now';
import type { AddressSuggestion } from '../server/services/GeoapifyAutocomplete';
import { adminApi } from './api';
import { useDashboard } from './context';
import { cn } from './lib/cn';
import { Input, NativeSelect } from './ui/input';
import { Field } from './ui/label';

// Hand-off address fields: country, state and city dropdowns from CountriesNow, and street
// suggestions from Geoapify (through /api/admin/address-suggest). Ported from our
// distance-shipping app. Every field still accepts typed values when a list isn't available.

// ---- Data hooks ------------------------------------------------------------------

/** Loads `load()` whenever `key` changes; ignores responses that arrive after the key moved on. */
function useRemote<T>(key: string | null, empty: T, load: () => Promise<T>): { data: T; loading: boolean } {
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    load().then(
      (data) => active && setResult({ key, data }),
      () => active && setResult({ key, data: empty }),
    );
    return () => {
      active = false;
    };
    // `load` and `empty` are derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return { data: empty, loading: false };
  if (result?.key !== key) return { data: empty, loading: true };
  return { data: result.data, loading: false };
}

/** CountriesNow countries (the built-in ISO list until they arrive, or if the request fails). */
function useCountries(): CountryOption[] {
  const [countries, setCountries] = useState<CountryOption[]>(fallbackCountries);
  useEffect(() => {
    let active = true;
    void loadCountries().then((list) => active && setCountries(list));
    return () => {
      active = false;
    };
  }, []);
  return countries;
}

/** Countries named in the dashboard language, sorted for display. */
function useCountryOptions(countries: CountryOption[]): { code: string; name: string }[] {
  const { locale } = useDashboard();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
    } catch {
      names = null;
    }
    const collator = new Intl.Collator(locale);
    return countries
      .map((c) => {
        let name = c.name;
        try {
          name = names?.of(c.code) ?? c.name;
        } catch {
          // A code Intl doesn't know: keep the CountriesNow name.
        }
        return { code: c.code, name };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [countries, locale]);
}

const NO_STATES: StateOption[] = [];
const NO_CITIES: string[] = [];

// ---- Fields ----------------------------------------------------------------------

export function AddressFields({ idPrefix, value, onChange }: { idPrefix: string; value: PostalAddress | undefined; onChange: (next: PostalAddress) => void }) {
  const { t } = useDashboard();
  const a = value ?? EMPTY_ADDRESS;
  const set = (patch: Partial<PostalAddress>) => onChange({ ...a, ...patch });

  const countries = useCountries();
  const countryOptions = useCountryOptions(countries);
  const country = countries.find((c) => c.code === a.country);
  const states = useRemote(country ? `${country.code}|${country.name}` : null, NO_STATES, () => loadStates(country!));
  const state = findState(states.data, a.subdivision);
  const cities = useRemote(country && state ? `${country.code}|${state.code}` : null, NO_CITIES, () => loadCities(country!, state!));

  const fillFromSuggestion = (s: AddressSuggestion) => {
    const match = findState(states.data, s.subdivision);
    set({ line1: s.line1 || a.line1, city: s.city || a.city, subdivision: match?.code ?? s.subdivision, postalCode: s.postalCode || a.postalCode });
  };

  const id = (f: string) => `${idPrefix}-${f}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('dash.address.country')} htmlFor={id('country')}>
        <NativeSelect
          id={id('country')}
          value={a.country}
          autoComplete="country"
          // A new country clears the parts that belonged to the old one.
          onChange={(e) => onChange({ ...EMPTY_ADDRESS, country: e.target.value })}
        >
          <option value="">{t('dash.address.selectCountry')}</option>
          {countryOptions.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
        </NativeSelect>
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('dash.address.line1')} htmlFor={id('line1')}>
          <StreetInput id={id('line1')} country={a.country} value={a.line1} onChange={(line1) => set({ line1 })} onSelect={fillFromSuggestion} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={t('dash.address.line2')} htmlFor={id('line2')}>
          <Input id={id('line2')} value={a.line2} maxLength={200} autoComplete="address-line2" onChange={(e) => set({ line2: e.target.value })} />
        </Field>
      </div>
      <Field label={t('dash.address.subdivision')} htmlFor={id('subdivision')}>
        {states.loading ? (
          <NativeSelect id={id('subdivision')} disabled value=""><option value="">{t('dash.address.loading')}</option></NativeSelect>
        ) : states.data.length === 0 ? (
          <Input id={id('subdivision')} value={a.subdivision} maxLength={100} autoComplete="address-level1" disabled={!a.country} onChange={(e) => set({ subdivision: e.target.value })} />
        ) : (
          // Picking a state clears the city, which belonged to the previous one.
          <NativeSelect id={id('subdivision')} value={state?.code ?? a.subdivision} autoComplete="address-level1" onChange={(e) => set({ subdivision: e.target.value, city: '' })}>
            <option value="">{t('dash.address.selectSubdivision')}</option>
            {/* Keep a value that isn't in the list (a suggestion or older data) instead of dropping it. */}
            {!state && a.subdivision && <option value={a.subdivision}>{a.subdivision}</option>}
            {states.data.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </NativeSelect>
        )}
      </Field>
      <Field label={t('dash.address.city')} htmlFor={id('city')}>
        <CityInput key={state?.code ?? ''} id={id('city')} value={a.city} cities={cities.data} loading={cities.loading} disabled={!a.country} onChange={(city) => set({ city })} />
      </Field>
      <Field label={t('dash.address.postalCode')} htmlFor={id('postal')}>
        <Input id={id('postal')} value={a.postalCode} maxLength={20} autoComplete="postal-code" onChange={(e) => set({ postalCode: e.target.value })} />
      </Field>
    </div>
  );
}

const OTHER_CITY = '__other__';

/** City dropdown for the chosen state, or free text when there's no list or the merchant picks "Other". */
function CityInput({ id, value, cities, loading, disabled, onChange }: { id: string; value: string; cities: string[]; loading: boolean; disabled: boolean; onChange: (v: string) => void }) {
  const { t } = useDashboard();
  const [typed, setTyped] = useState(false);
  if (loading) return <NativeSelect id={id} disabled value=""><option value="">{t('dash.address.loading')}</option></NativeSelect>;
  if (cities.length === 0 || typed) {
    return <Input id={id} value={value} maxLength={100} autoComplete="address-level2" disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <NativeSelect id={id} value={value} autoComplete="address-level2" onChange={(e) => (e.target.value === OTHER_CITY ? setTyped(true) : onChange(e.target.value))}>
      <option value="">{t('dash.address.selectCity')}</option>
      {value && !cities.includes(value) && <option value={value}>{value}</option>}
      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={OTHER_CITY}>{t('dash.address.cityOther')}</option>
    </NativeSelect>
  );
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/**
 * Street input with Geoapify suggestions, restricted to the chosen country. ARIA combobox: arrow
 * keys move, Enter picks, Escape closes. The field stays free text if suggestions are unavailable.
 */
function StreetInput({ id, country, value, onChange, onSelect }: { id: string; country: string; value: string; onChange: (v: string) => void; onSelect: (s: AddressSuggestion) => void }) {
  const { t, locale } = useDashboard();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const seq = useRef(0);
  const hasCountry = /^[A-Z]{2}$/.test(country);

  useEffect(() => {
    if (query === null || !hasCountry) return;
    const text = query.trim();
    const n = ++seq.current;
    if (text.length < MIN_CHARS) return;
    const timer = setTimeout(() => {
      setSearching(true);
      adminApi.addressSuggest({ text, country, lang: locale.slice(0, 2) })
        .then((res) => {
          if (n !== seq.current) return;
          setSuggestions(res.suggestions ?? []);
          setActive(-1);
          setOpen(true);
        })
        // Suggestions are optional: on failure the merchant just keeps typing.
        .catch(() => n === seq.current && setSuggestions([]))
        .finally(() => n === seq.current && setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, country, hasCountry, locale]);

  // A new country invalidates suggestions from the previous one.
  useEffect(() => {
    seq.current++;
    setSuggestions([]);
    setOpen(false);
    setQuery(null);
    setSearching(false);
  }, [country]);

  const choose = (s: AddressSuggestion) => {
    seq.current++;
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query !== null && query.trim().length >= MIN_CHARS;
  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={200}
        disabled={!hasCountry}
        placeholder={hasCountry ? t('dash.address.searchPlaceholder') : t('dash.address.selectCountryFirst')}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          if (e.target.value.trim().length < MIN_CHARS) {
            setSuggestions([]);
            setOpen(false);
            setSearching(false);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {searching && <Loader2 className="absolute end-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label={t('dash.address.searching')} />}
      {showList && (
        <ul id={listId} role="listbox" aria-label={t('dash.address.suggestions')} className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.length === 0 && !searching && <li className="px-3 py-2 text-sm text-muted-foreground">{t('dash.address.noSuggestions')}</li>}
          {suggestions.map((s, i) => (
            <li
              key={s.formatted}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input's blur doesn't close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-start gap-2 rounded-sm px-3 py-2 text-sm', i === active && 'bg-accent text-accent-foreground')}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">{s.formatted}</span>
            </li>
          ))}
          {/* Geoapify's free plan requires attribution. */}
          <li role="presentation" className="border-t px-3 pt-1.5 pb-0.5 text-end text-[11px] text-muted-foreground">{t('dash.address.attribution')}</li>
        </ul>
      )}
    </div>
  );
}
