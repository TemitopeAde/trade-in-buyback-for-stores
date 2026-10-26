import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dashboard } from '@wix/dashboard';
import { createTranslator, direction as getDirection, isRtl as checkIsRtl, resolveLocale, type SupportedLocale, type Translate } from '../lib/i18n';
import { adminApi, AdminApiError } from './api';
import {
  canPerformAction,
  getPlanEntitlements,
  getUpgradeUrl,
  type InstancePlanStatus,
  type PlanAction,
  type PlanEntitlements,
  type PlanTier,
} from '../lib/plans';

// Routing uses the dashboard's own location (observeState + navigate), so every view is
// deep-linkable, e.g. /requests/<id>.

const LOCALE_STORAGE_KEY = 'trade_in_dashboard_locale';

type Ctx = {
  t: Translate;
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
  path: string;
  go: (path: string) => void;
  errorText: (err: unknown) => string;
  plan: PlanTier;
  entitlements: PlanEntitlements;
  upgradeUrl: string;
  can: (action: PlanAction, currentCount?: number) => boolean;
  isBasic: boolean;
};
const DashboardContext = createContext<Ctx | null>(null);

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard outside provider');
  return ctx;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const getInitialLocale = (): SupportedLocale => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
      if (stored) return resolveLocale(stored);
    } catch {
      // storage unavailable
    }
    return 'en';
  };

  const [state, setState] = useState<{ path: string; pageId?: string; locale: SupportedLocale }>({
    path: '/',
    locale: getInitialLocale(),
  });

  const [planStatus, setPlanStatus] = useState<InstancePlanStatus>({
    appId: '85628c65-b784-484a-b1c9-3182e192c1fd',
    instanceId: '',
    plan: 'basic',
    isFree: true,
    freeTrialAvailable: true,
    upgradeUrl: getUpgradeUrl(),
    entitlements: getPlanEntitlements('basic'),
  });

  useEffect(() => {
    dashboard.observeState((params, env) => {
      const location = (params as { location?: { pathname?: string; pageId?: string } }).location;
      setState((prev) => {
        let localeToUse = prev.locale;
        try {
          const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
          if (!stored && env?.locale) {
            localeToUse = resolveLocale(env.locale);
          }
        } catch {
          if (env?.locale) localeToUse = resolveLocale(env.locale);
        }
        return {
          path: location?.pathname || '/',
          pageId: location?.pageId,
          locale: localeToUse,
        };
      });
    });
  }, []);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // storage unavailable
    }
    setState((s) => ({ ...s, locale: resolveLocale(newLocale) }));
  }, []);

  const dir = useMemo(() => getDirection(state.locale), [state.locale]);
  const isRtl = useMemo(() => checkIsRtl(state.locale), [state.locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
      document.documentElement.lang = state.locale;
    }
  }, [dir, state.locale]);

  useEffect(() => {
    adminApi.plan().then(setPlanStatus).catch(() => undefined);
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

  const can = useCallback(
    (action: PlanAction, currentCount?: number) => canPerformAction(planStatus.plan, action, currentCount),
    [planStatus.plan],
  );

  const value = useMemo(
    () => ({
      t,
      locale: state.locale,
      setLocale,
      direction: dir,
      isRtl,
      path: state.path,
      go,
      errorText,
      plan: planStatus.plan,
      entitlements: planStatus.entitlements,
      upgradeUrl: planStatus.upgradeUrl,
      can,
      isBasic: planStatus.plan === 'basic',
    }),
    [t, state.locale, setLocale, dir, isRtl, state.path, go, errorText, planStatus, can],
  );
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
