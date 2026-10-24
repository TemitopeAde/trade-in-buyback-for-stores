import React, { useState } from 'react';
import { ExternalLink, LayoutTemplate, ListChecks, MousePointerClick, ScrollText } from 'lucide-react';
import { dashboard } from '@wix/dashboard';
import { toast } from 'sonner';
import { PageHeader } from '../components';
import { useDashboard } from '../context';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert } from '../ui/misc';

// Site plugin ID of the product page CTA (src/extensions/site/plugins/trade-in-product-cta).
const CTA_PLUGIN_ID = '878529eb-fc6b-410f-ac98-90672c15aac4';
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
  const [adding, setAdding] = useState(false);

  const addCta = async () => {
    setAdding(true);
    try {
      // Supported placement API: opens Wix's own confirmation and adds the plugin to the product page.
      await dashboard.addSitePlugin(CTA_PLUGIN_ID, { placement: NEW_PRODUCT_PAGE });
      toast.success(t('dash.appearance.ctaAdded'));
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
              <CardTitle className="flex items-center gap-2"><Icon className="size-4" aria-hidden="true" />{t(`dash.appearance.${key}`)}</CardTitle>
              <CardDescription>{t(`dash.appearance.${key}.desc`)}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{t('dash.appearance.inEditor')}</p></CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MousePointerClick className="size-4" aria-hidden="true" />{t('dash.appearance.cta')}</CardTitle>
            <CardDescription>{t('dash.appearance.cta.desc')}</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" busy={adding} onClick={addCta}>{t('dash.appearance.addCta')}</Button></CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">{t('dash.appearance.statusNote')}</p>
    </div>
  );
}
