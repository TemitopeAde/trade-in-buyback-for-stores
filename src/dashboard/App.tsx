import React, { useEffect } from 'react';
import { Activity, BarChart3, Bell, Globe, LayoutDashboard, ListOrdered, Palette, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Toaster } from 'sonner';
import { STATUS_GROUPS, type AdminListRequest } from '../lib/schemas/admin';
import { direction, TOP_LANGUAGES, type SupportedLocale } from '../lib/i18n';
import { cn } from './lib/cn';
import { DashboardProvider, useDashboard } from './context';
import { AppearancePage } from './pages/Appearance';
import { DiagnosticsPage } from './pages/Diagnostics';
import { NotificationsPage } from './pages/Notifications';
import { ReportsPage } from './pages/Reports';
import { adminApi } from './api';
import { OverviewPage } from './pages/Overview';
import { RequestDetailPage } from './pages/RequestDetail';
import { RequestsPage } from './pages/Requests';
import { RulesPage } from './pages/Rules';
import { SettingsPage } from './pages/Settings';
import { NativeSelect } from './ui/input';
import './styles.css';

const NAV = [
  { path: '/', key: 'dash.nav.overview', icon: LayoutDashboard },
  { path: '/requests', key: 'dash.nav.requests', icon: ListOrdered },
  { path: '/rules', key: 'dash.nav.rules', icon: SlidersHorizontal },
  { path: '/appearance', key: 'dash.nav.appearance', icon: Palette },
  { path: '/settings', key: 'dash.nav.settings', icon: Settings2 },
  { path: '/notifications', key: 'dash.nav.notifications', icon: Bell },
  { path: '/reports', key: 'dash.nav.reports', icon: BarChart3 },
  { path: '/diagnostics', key: 'dash.nav.diagnostics', icon: Activity },
] as const;

function Router() {
  const { path } = useDashboard();
  const [pathname, search = ''] = path.split('?');
  const seg = pathname.split('/').filter(Boolean);
  switch (seg[0]) {
    case undefined: return <OverviewPage />;
    case 'requests': {
      if (seg[1]) return <RequestDetailPage id={seg[1]} />;
      const group = new URLSearchParams(search).get('group');
      const valid = group && group in STATUS_GROUPS ? (group as AdminListRequest['statusGroup']) : undefined;
      return <RequestsPage key={valid ?? 'all'} initialGroup={valid} />;
    }
    case 'rules': return <RulesPage editId={seg[1]} />;
    case 'appearance': return <AppearancePage />;
    case 'settings': return <SettingsPage />;
    case 'notifications': return <NotificationsPage />;
    case 'reports': return <ReportsPage />;
    case 'diagnostics': return <DiagnosticsPage />;
    default: return <OverviewPage />;
  }
}

function Shell() {
  const { t, path, go, locale, setLocale, isBasic, upgradeUrl } = useDashboard();
  // Retry sweep for background jobs (emails, credit) whenever the dashboard opens. Best effort.
  useEffect(() => {
    adminApi.process().catch(() => undefined);
  }, []);
  const active = (p: string) => (p === '/' ? path === '/' || path === '' : path.startsWith(p));
  return (
    <div dir={direction(locale)} lang={locale} className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-7xl gap-6 p-4 md:grid-cols-[220px_1fr] md:p-6">
        <nav aria-label={t('dash.nav.label')} className="md:sticky md:top-6 md:self-start">
          <p className="mb-3 px-2 text-sm font-semibold">{t('dash.appName')}</p>
          {isBasic && (
            <div className="mb-3 px-2">
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 cursor-pointer text-center"
              >
                <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{t('dash.plan.startTrial')}</span>
              </a>
            </div>
          )}
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {NAV.map(({ path: p, key, icon: Icon }) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => go(p)}
                  aria-current={active(p) ? 'page' : undefined}
                  className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm whitespace-nowrap transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none cursor-pointer', active(p) && 'bg-accent font-medium')}
                >
                  <Icon className="size-4" aria-hidden="true" />{t(key)}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-border pt-4 px-2">
            <label htmlFor="dashboard-lang-select" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Globe className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{t('dash.sidebar.language')}</span>
            </label>
            <NativeSelect
              id="dashboard-lang-select"
              aria-label={t('dash.sidebar.selectLanguage')}
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              className="h-8 text-xs cursor-pointer bg-background"
            >
              {TOP_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </NativeSelect>
          </div>
        </nav>
        <main className="min-w-0"><Router /></main>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export function TradeInDashboard() {
  return (
    <DashboardProvider>
      <Shell />
    </DashboardProvider>
  );
}
