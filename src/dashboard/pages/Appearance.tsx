import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, LayoutTemplate, ListChecks, MousePointerClick, ScrollText } from 'lucide-react';
import { dashboard } from '@wix/dashboard';
import { toast } from 'sonner';
import { CTA_PLUGIN_ID } from '../../lib/schemas/admin';
import { adminApi } from '../api';
import { PageHeader } from '../components';
import { useDashboard, useLoad } from '../context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, Skeleton } from '../ui/misc';

const NEW_PRODUCT_PAGE = { appDefinitionId: 'a0c68605-c2e7-4c8d-9ea1-767f9770e087', widgetId: '6a25b678-53ec-4b37-a190-65fcd1ca1a63', slotId: 'product-page-details-2' };

export function AppearancePage() {
  const { t } = useDashboard();
  const siteInfo = (() => {
    try {
      return dashboard.getSiteInfo();
    } catch {
      return null;
    }
  })();
  const { data: statusData, loading: statusLoading, reload: reloadStatus } = useLoad(() => adminApi.pluginStatus(), []);
  const [adding, setAdding] = useState(false);

  const ctaStatus = statusData?.placementStatuses.find((p) => p.pluginId === CTA_PLUGIN_ID);
  const isCtaPlaced = Boolean(ctaStatus?.placedInSlot);

  const addCta = async () => {
    setAdding(true);
    try {
      // Supported placement API: opens Wix's own confirmation and adds the plugin to the product page.
      await dashboard.addSitePlugin(CTA_PLUGIN_ID, { placement: NEW_PRODUCT_PAGE });
      toast.success(t('dash.appearance.ctaAdded'));
      reloadStatus();
    } catch {
      toast.error(t('dash.appearance.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const widgets = [
    { key: 'form', icon: LayoutTemplate },
    { key: 'status', icon: ScrollText },
    { key: 'mine', icon: ListChecks },
  ] as const;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('dash.appearance.title')}
        subtitle={t('dash.appearance.subtitle')}
        actions={siteInfo?.editorUrl ? <Button asChild><a href={siteInfo.editorUrl} target="_blank" rel="noreferrer noopener">{t('dash.appearance.openEditor')}<ExternalLink aria-hidden="true" /></a></Button> : undefined}
      />
      <Alert>{t('dash.appearance.howTo')}</Alert>
      {!siteInfo?.editorUrl && <Alert variant="warning">{t('dash.appearance.noEditor')}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {widgets.map(({ key, icon: Icon }) => (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><Icon className="size-4" aria-hidden="true" />{t(`dash.appearance.${key}`)}</CardTitle>
                <Badge variant="outline" className="text-muted-foreground">{t('dash.appearance.editorWidget')}</Badge>
              </div>
              <CardDescription>{t(`dash.appearance.${key}.desc`)}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{t('dash.appearance.inEditor')}</p></CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><MousePointerClick className="size-4" aria-hidden="true" />{t('dash.appearance.cta')}</CardTitle>
              {statusLoading ? (
                <Skeleton className="h-5 w-24" />
              ) : isCtaPlaced ? (
                <Badge variant="success" className="flex items-center gap-1">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {t('dash.appearance.placed')}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {t('dash.appearance.notPlaced')}
                </Badge>
              )}
            </div>
            <CardDescription>{t('dash.appearance.cta.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {isCtaPlaced ? t('dash.appearance.ctaPlacedDesc') : t('dash.appearance.ctaNotPlacedDesc')}
            </p>
            <div>
              <Button variant={isCtaPlaced ? 'outline' : 'default'} busy={adding} onClick={addCta}>
                {isCtaPlaced ? t('dash.appearance.reAddCta') : t('dash.appearance.addCta')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">{t('dash.appearance.statusNote')}</p>
    </div>
  );
}
