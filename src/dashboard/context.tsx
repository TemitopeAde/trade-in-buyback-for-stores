import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dashboard } from '@wix/dashboard';
import { createTranslator, resolveLocale, type Translate } from '../lib/i18n';
import { AdminApiError } from './api';

// Routing uses the dashboard's own location (observeState + navigate), so every view is
// deep-linkable, e.g. /requests/<id>.

type Ctx = { t: Translate; locale: string; path: string; go: (path: string) => void; errorText: (err: unknown) => string };
const DashboardContext = createContext<Ctx | null>(null);

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard outside provider');
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ path: string; pageId?: string; locale: string }>({ path: '/', locale: 'en' });
  useEffect(() => {
    dashboard.observeState((params, env) => {
      const location = (params as { location?: { pathname?: string; pageId?: string } }).location;
      setState({ path: location?.pathname || '/', pageId: location?.pageId, locale: resolveLocale(env?.locale) });
    });
  }, []);
  const t = useMemo(() => createTranslator(state.locale), [state.locale]);
  const go = useCallback((path: string) => {
    if (state.pageId) dashboard.navigate({ pageId: state.pageId, relativeUrl: path }, { history: 'push' });
    setState((s) => ({ ...s, path }));
  }, [state.pageId]);
  const errorText = useCallback((err: unknown) => {
    const code = err instanceof AdminApiError ? err.code : 'internal';
    if (code === 'conflict' || code === 'invalid_transition') return t('dash.conflict');
    if (code === 'forbidden') return t('dash.forbidden');
    return t('dash.genericError');
  }, [t]);
  const value = useMemo(() => ({ t, locale: state.locale, path: state.path, go, errorText }), [t, state.locale, state.path, go, errorText]);
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

/** Small async-state helper for page loads with retry. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    loader().then(setData, setError).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { data, setData, error, loading, reload: load };
}
