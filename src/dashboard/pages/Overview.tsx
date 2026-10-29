import React from 'react';
import { ArrowRight, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { STATUS_GROUPS } from '../../lib/schemas/admin';
import { formatDateTime } from '../../lib/i18n';
import { adminApi } from '../api';
import { LoadError, PageHeader, useMoney } from '../components';
import { useDashboard, useLoad } from '../context';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/misc';

export function OverviewPage() {
  const { t, go, locale, isBasic, upgradeUrl } = useDashboard();
  const money = useMoney();
  const { data, error, loading, reload } = useLoad(() => adminApi.overview(), []);
  const groups = Object.keys(STATUS_GROUPS) as (keyof typeof STATUS_GROUPS)[];

  if (error) return <LoadError onRetry={reload} />;

  const checks = data
    ? ([
        ['dash.setup.stores', data.setup.storesInstalled, undefined],
        ['dash.setup.rules', data.setup.hasRules, '/rules'],
        ['dash.setup.settings', data.setup.settingsSaved, '/settings'],
        ['dash.setup.terms', data.setup.termsConfigured, '/settings'],
        ...(data.setup.pluginPlaced !== undefined ? [['dash.setup.pluginPlaced', data.setup.pluginPlaced, '/appearance'] as const] : []),
        ...(data.setup.giftCardsAvailable !== undefined ? [['dash.setup.giftCards', data.setup.giftCardsAvailable, '/diagnostics'] as const] : []),
        ...(data.setup.giftCardEmailWorking !== undefined ? [['dash.setup.giftCardEmail', data.setup.giftCardEmailWorking, '/settings'] as const] : []),
        ...(data.setup.emailConfigured !== undefined ? [['dash.setup.email', data.setup.emailConfigured, '/notifications'] as const] : []),
      ] as const)
    : [];
  const credit = data ? Object.entries(data.creditIssuedMinorByCurrency) : [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t('dash.overview.title')} subtitle={t('dash.overview.subtitle')} actions={<Button variant="outline" onClick={() => go('/requests')}>{t('dash.overview.viewAll')}<ArrowRight aria-hidden="true" /></Button>} />
      {isBasic && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-transparent bg-gradient-to-r from-purple-700 via-violet-700 to-indigo-800 p-4 text-white">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-purple-100 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-white">{t('dash.plan.basicBadge')}</p>
              {data?.usage.limit != null && (
                <p className="text-xs font-medium text-white mt-0.5">
                  {t('dash.plan.usage', { used: data.usage.used, limit: data.usage.limit })}
                  {data.usage.used >= data.usage.limit && <> {t('dash.plan.limitReached')}</>}
                </p>
              )}
              <p className="text-xs text-purple-100 mt-0.5">{t('dash.plan.upgradePrompt')}</p>
            </div>
          </div>
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-purple-800 shadow-xs transition hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t('dash.plan.startTrial')}
          </a>
        </div>
      )}
      <section aria-label={t('dash.nav.requests')} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <button key={g} type="button" onClick={() => go(`/requests?group=${g}`)} className="rounded-xl border bg-card p-4 text-start shadow-xs transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none cursor-pointer">
            <p className="text-sm text-muted-foreground">{t(`dash.group.${g}`)}</p>
            {loading || !data ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold tabular-nums">{data.counts[g]}</p>}
          </button>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('dash.setup.title')}</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : (
              <ul className="grid gap-2">
                {checks.map(([key, ok, path]) => (
                  <li key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      {ok ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />}
                      {t(key)}
                      <span className="sr-only">{ok ? t('dash.setup.done') : t('dash.setup.todo')}</span>
                    </span>
                    {!ok && path && <Button size="sm" variant="link" onClick={() => go(path)}>{t('dash.setup.fix')}</Button>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('dash.overview.creditIssued')}</CardTitle>
            {!loading && credit.length === 0 && <CardDescription>{t('dash.overview.noCredit')}</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-1">
            {credit.map(([currency, minor]) => <p key={currency} className="text-2xl font-semibold tabular-nums">{money(minor, currency)}</p>)}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('dash.overview.recent')}</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-24" /> : !data?.recent.length ? (
            <p className="text-sm text-muted-foreground">{t('dash.overview.noActivity')}</p>
          ) : (
            <ul className="grid gap-2">
              {data.recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{e.toStatus ? t(`status.${e.toStatus}`) : e.eventType === 'note.added' ? t('dash.event.note') : e.eventType === 'trade_in.deleted' ? t('dash.event.deleted') : t('dash.event.other', { event: e.eventType })} · <span className="text-muted-foreground">{t(`dash.actor.${e.actorType}`)}</span></span>
                  <time className="text-muted-foreground" dateTime={e.at}>{formatDateTime(e.at, locale)}</time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
