import { en, type MessageKey } from './en';
import { LOCALE_CATALOGS } from './locales';

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export const SUPPORTED_LOCALES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'no', 'fi', 'cs', 'tr', 'ru', 'ja', 'ko', 'zh', 'ar', 'he',
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export function resolveLocale(input: string | null | undefined): SupportedLocale {
  const lang = (input ?? 'en').toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(lang) ? (lang as SupportedLocale) : 'en';
}

export function isRtl(locale: string): boolean {
  return RTL.has(locale.toLowerCase().split(/[-_]/)[0]);
}

export function direction(locale: string): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Missing translations fall back to English; missing English keys are a compile error (MessageKey). */
export function createTranslator(locale: string): Translate {
  const catalog = LOCALE_CATALOGS[resolveLocale(locale)] ?? {};
  return (key, vars) => interpolate(catalog[key] ?? en[key], vars);
}

export function formatDate(value: Date | string | number, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, opts).format(date);
}

export function formatDateTime(value: Date | string | number, locale: string): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
}
