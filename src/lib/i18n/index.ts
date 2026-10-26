import { en, type MessageKey } from './en';
import { LOCALE_CATALOGS } from './locales';

export type { MessageKey };
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export const SUPPORTED_LOCALES = [
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur',
  'id', 'de', 'ja', 'mr', 'te', 'tr', 'ta', 'vi', 'fil', 'ko',
  'it', 'nl', 'pl', 'sv', 'da', 'no', 'fi', 'cs', 'he',
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LanguageOption {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

/** Top 20 most populous languages in the world */
export const TOP_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文 (简体)', dir: 'ltr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr' },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
] as const;

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
