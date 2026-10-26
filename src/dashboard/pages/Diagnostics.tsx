import React, { useState } from 'react';
import { toast } from 'sonner';
import { formatDateTime } from '../../lib/i18n';
import { adminApi } from '../api';
import { LoadError, PageHeader } from '../components';
import { useDashboard, useLoad } from '../context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/misc';

export function DiagnosticsPage() {
  const { t, locale, go, errorText, entitlements } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => Promise.all([adminApi.overview(), adminApi.outbox()]), []);
  const [busy, setBusy] = useState<string>();
  if (error) return <LoadError onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64" />;
  const [overview, jobs] = data;

  const revive = async (id: string) => {
    setBusy(id);
    try {
      await adminApi.reviveJob(id);
      await adminApi.process();
      toast.success(t('dash.diag.jobRetried'));
      reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t('dash.diag.title')} subtitle={t('dash.diag.subtitle')} />
      <Card>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <div className="flex flex-wrap justify-between gap-4"><dt className="text-muted-foreground">{t('dash.diag.catalog')}</dt><dd className="font-mono">{overview.setup.catalogVersion}</dd></div>
            <div className="flex flex-wrap justify-between gap-4">
              <dt className="text-muted-foreground">{t('dash.diag.giftCards')}</dt>
              <dd>{jobs.giftCardsAvailable ? <Badge variant="success">{t('dash.diag.available')}</Badge> : <span className="text-destructive">{t('dash.diag.unavailable')}</span>}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-4">
              <dt className="text-muted-foreground">{t('dash.diag.pluginStatus')}</dt>
              <dd>
                {overview.setup.pluginPlaced === undefined ? (
                  <span className="text-muted-foreground">—</span>
                ) : overview.setup.pluginPlaced ? (
                  <Badge variant="success">{t('dash.diag.placed')}</Badge>
                ) : (
                  <Badge variant="outline">{t('dash.diag.notPlaced')}</Badge>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t('dash.diag.jobs')}</CardTitle></CardHeader>
        <CardContent>
          {jobs.dead.length === 0 ? <p className="text-sm text-muted-foreground">{t('dash.diag.noJobs')}</p> : (
            <ul className="grid gap-3">
              {jobs.dead.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="grid">
                    <span className="font-mono">{j.eventType}</span>
                    <span className="text-muted-foreground">{t('dash.diag.attempts', { count: j.attempts, error: j.lastError ?? '—' })} · {formatDateTime(j.updatedAt, locale)}</span>
                  </div>
                  <div className="flex gap-2">
                    {j.tradeInId && <Button variant="link" size="sm" onClick={() => go(`/requests/${j.tradeInId}`)}>{t('common.viewDetails')}</Button>}
                    <Button
                      variant="outline"
                      size="sm"
                      busy={busy === j.id}
                      disabled={!!busy || !entitlements.expeditedRetry}
                      title={!entitlements.expeditedRetry ? t('dash.plan.reviveJobRequiresPro') : undefined}
                      onClick={() => revive(j.id)}
                    >
                      {t('dash.diag.retryJob')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
