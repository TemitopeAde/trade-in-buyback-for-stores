import { useEffect, useState } from 'react';
import { members } from '@wix/members';
import { multilingual, window as wixWindow } from '@wix/site-window';
import { resolveLocale } from '../../../lib/i18n';

// Detects where the widget runs. In the Editor we render a styled preview and never call the
// backend (the Editor sandbox has no visitor session and data calls would return noise).

export type SiteEnv = { ready: boolean; isEditor: boolean; locale: string };

export function useSiteEnv(): SiteEnv {
  const [env, setEnv] = useState<SiteEnv>({ ready: false, isEditor: false, locale: 'en' });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [mode, lang] = await Promise.all([
        wixWindow.viewMode().catch(() => 'Site'),
        multilingual.currentLanguage().catch(() => undefined),
      ]);
      const fallbackLang = typeof document !== 'undefined' ? document.documentElement.lang : 'en';
      if (alive) setEnv({ ready: true, isEditor: mode === 'Editor', locale: resolveLocale(lang || fallbackLang) });
    })();
    return () => {
      alive = false;
    };
  }, []);
  return env;
}

/** The signed-in member's login email, or undefined for visitors. Used only to prefill the form. */
export async function currentMemberEmail(): Promise<string | undefined> {
  try {
    const { member } = await members.getCurrentMember({ fieldsets: ['EXTENDED'] });
    return member?.loginEmail ?? undefined;
  } catch {
    return undefined;
  }
}

/** Reads a query parameter from the host page URL (live site only). */
export function readQueryParam(name: string): string | undefined {
  try {
    return new URL(globalThis.location.href).searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Removes a sensitive query parameter (e.g. an access token) from the visible URL after reading it. */
export function scrubQueryParam(name: string): void {
  try {
    const url = new URL(globalThis.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    globalThis.history.replaceState(globalThis.history.state, '', url.toString());
  } catch {
    // Some hosts block history access; leaving the URL unchanged is harmless.
  }
}

export function newIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
