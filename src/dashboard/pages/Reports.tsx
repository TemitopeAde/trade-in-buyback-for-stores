import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { adminApi } from '../api';
import { LoadError, PageHeader, StatusBadge, useMoney } from '../components';
import { useDashboard, useLoad } from '../context';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { NativeSelect } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, Skeleton } from '../ui/misc';
import type { TradeInStatus } from '../../lib/lifecycle';

const PERIODS = [7, 30, 90, 365];

export function ReportsPage() {
  const { t, entitlements, isBasic } = useDashboard();
  const money = useMoney();
  const [days, setDays] = useState(isBasic ? 7 : 30);
  const { data, error, loading, reload } = useLoad(() => adminApi.report(days), [days]);
  const list = (m: Record<string, number> | undefined) => {
    const entries = Object.entries(m ?? {});
    return entries.length ? entries.map(([c, v]) => money(v, c)).join(' · ') : t('dash.reports.none');
  };

  const handleExportCsv = () => {
    if (!data) return;
    const rows = [
      ['Metric', 'Value'],
      ['Submitted', String(data.submitted)],
      ['Approved', String(data.approved)],
      ['Rejected', String(data.rejected)],
      ['Conversion Rate', `${data.conversionRate}%`],
      ['Resale Drafts', String(data.resaleDrafts)],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trade-in-report-${days}d.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('dash.reports.title')}
        subtitle={t('dash.reports.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={!entitlements.csvExport || !data}
              title={!entitlements.csvExport ? t('dash.plan.csvExportRequiresPro') : undefined}
              onClick={handleExportCsv}
            >
              <Download className="size-4" aria-hidden="true" />
              {t('dash.reports.exportCsv')}
            </Button>
            <div className="grid gap-1">
              <Label htmlFor="rep-period" className="sr-only">{t('dash.reports.period')}</Label>
              <NativeSelect id="rep-period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {PERIODS.map((d) => {
                  const disabled = d > entitlements.maxReportDays;
                  return (
                    <option key={d} value={d} disabled={disabled}>
                      {t('dash.reports.days', { days: d })}{disabled ? ` (${t('dash.plan.dateRangeRequiresPro')})` : ''}
                    </option>
                  );
                })}
              </NativeSelect>
            </div>
          </div>
        }
      />
      {error ? <LoadError onRetry={reload} /> : loading || !data ? <Skeleton className="h-64" /> : (
        <>
          {data.truncated && <Alert variant="warning">{t('dash.reports.truncated')}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ['dash.reports.submitted', String(data.submitted)],
              ['dash.reports.approved', String(data.approved)],
              ['dash.reports.rejected', String(data.rejected)],
              ['dash.reports.conversion', `${data.conversionRate}%`],
              ['dash.reports.creditIssued', list(data.creditIssuedMinorByCurrency)],
              ['dash.reports.creditRedeemed', list(data.creditRedeemedMinorByCurrency)],
              ['dash.reports.avgOffer', list(data.averageOfferMinorByCurrency)],
              ['dash.reports.resale', String(data.resaleDrafts)],
            ] as const).map(([key, value]) => (
              <Card key={key} className="py-4">
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t(key)}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                  {key === 'dash.reports.creditRedeemed' && data.redemptionPartial && <p className="mt-1 text-xs text-muted-foreground">{t('dash.reports.redeemedPartial')}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>{t('dash.reports.byStatus')}</CardTitle></CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {Object.entries(data.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between gap-3 text-sm">
                    <StatusBadge status={status as TradeInStatus} /><span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
