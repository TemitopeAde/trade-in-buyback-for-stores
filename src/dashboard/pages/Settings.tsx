import React, { lazy, Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SUPPORTED_LOCALES } from '../../lib/i18n';
import type { Settings } from '../../lib/schemas/domain';
import { isCompleteAddress } from '../../lib/location/address';
import { hasTerms, termsEditorValue } from '../../lib/terms';
import { AdminApiError, adminApi } from '../api';
import { LoadError, MoneyInput, PageHeader } from '../components';
import { useDashboard, useLoad } from '../context';
import { AddressFields } from '../address';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, NativeSelect, Textarea } from '../ui/input';
import { Field, Label } from '../ui/label';
import { Alert, Skeleton } from '../ui/misc';
import { Switch } from '../ui/switch';
import { InfoTip } from '../ui/tooltip';

// Quill touches `document` on import, so it loads only in the browser.
const TermsEditor = lazy(() => import('../TermsEditor'));

// Defined at module level so it isn't remounted on every render (keeps keyboard focus).
function Toggle({ id, label, tip, checked, onChange, disabledNote }: { id: string; label: string; tip?: string; checked: boolean; onChange: (v: boolean) => void; disabledNote?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} disabled={!!disabledNote} onCheckedChange={onChange} aria-describedby={disabledNote ? `${id}-plan` : undefined} />
      <Label htmlFor={id}>{label}</Label>
      {tip && <InfoTip text={tip} />}
      {disabledNote && <span id={`${id}-plan`} className="text-xs text-muted-foreground">{disabledNote}</span>}
    </div>
  );
}

export function SettingsPage() {
  const { t, errorText, entitlements } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => adminApi.settings(), []);
  const [draft, setDraft] = useState<Settings>();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setDraft({ ...data, termsHtml: termsEditorValue(data.termsHtml) });
  }, [data]);

  if (error) return <LoadError onRetry={reload} />;
  if (loading || !draft) return <Skeleton className="h-96" />;
  const s = draft;
  // Amounts are entered in the site's payment currency (from its business info, not a setting).
  const currency = data!.siteCurrency;
  const patch = (fn: (d: Settings) => Settings) => setDraft((d) => (d ? fn(structuredClone(d)) : d));
  const fieldErr = (path: string) => (errors[path] ? t('dash.saveError') : undefined);
  // Saved values are kept across plan changes; the form shows what applies on the current plan.
  const methodOn = (m: 'dropOff' | 'shipIn') => s.handoff[m].enabled && (m !== 'shipIn' || entitlements.shipIn);
  const handoffMissing = !methodOn('dropOff') && !methodOn('shipIn');

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      setDraft(await adminApi.saveSettings(s));
      toast.success(t('dash.saved'));
    } catch (err) {
      if (err instanceof AdminApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof AdminApiError && err.fields ? t('dash.saveError') : errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <PageHeader title={t('dash.settings.title')} subtitle={t('dash.settings.subtitle')} actions={<Button type="submit" busy={saving} disabled={handoffMissing}>{t('dash.save')}</Button>} />

      <Card>
        <CardHeader><CardTitle>{t('dash.settings.handoff')}</CardTitle></CardHeader>
        <CardContent className="grid gap-6">
          {handoffMissing && <Alert variant="destructive">{t('dash.settings.handoffRequired')}</Alert>}
          {(['dropOff', 'shipIn'] as const).map((m) => (
            <fieldset key={m} className="grid gap-3">
              <legend className="sr-only">{t(`dash.settings.${m}`)}</legend>
              <Toggle
                id={`h-${m}`}
                label={t(`dash.settings.${m}`)}
                tip={t(`dash.settings.tip.${m}`)}
                checked={methodOn(m)}
                onChange={(v) => patch((d) => { d.handoff[m].enabled = v; return d; })}
                disabledNote={m === 'shipIn' && !entitlements.shipIn ? t('dash.plan.shipInRequiresPro') : undefined}
              />
              {methodOn(m) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <fieldset className="grid gap-2 sm:col-span-2">
                    <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">{t('dash.settings.address')}<InfoTip text={t('dash.settings.tip.address')} /></legend>
                    <AddressFields idPrefix={`h-${m}`} value={s.handoff[m].location} onChange={(loc) => patch((d) => { d.handoff[m].location = loc; return d; })} />
                    {s.handoff[m].address && !isCompleteAddress(s.handoff[m].location) && (
                      <p className="text-xs text-muted-foreground">{t('dash.settings.addressLegacy', { address: s.handoff[m].address.replace(/\n/g, ', ') })}</p>
                    )}
                    {Object.keys(errors).some((k) => k.startsWith(`handoff.${m}.location`)) && <p className="text-xs font-medium text-destructive" role="alert">{t('dash.saveError')}</p>}
                  </fieldset>
                  <Field label={t('dash.settings.instructions')} htmlFor={`h-${m}-ins`} labelAfter={<InfoTip text={t('dash.settings.tip.instructions')} />} error={fieldErr(`handoff.${m}.instructions`)}>
                    <Textarea id={`h-${m}-ins`} value={s.handoff[m].instructions} maxLength={2000} onChange={(e) => patch((d) => { d.handoff[m].instructions = e.target.value; return d; })} />
                  </Field>
                  {m === 'shipIn' && <Toggle id="h-tracking" label={t('dash.settings.allowTracking')} tip={t('dash.settings.tip.allowTracking')} checked={s.handoff.shipIn.allowTracking} onChange={(v) => patch((d) => { d.handoff.shipIn.allowTracking = v; return d; })} />}
                </div>
              )}
            </fieldset>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('dash.settings.credit')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t('dash.settings.minimumCredit', { currency })} htmlFor="s-min" labelAfter={<InfoTip text={t('dash.settings.tip.minimumCredit')} />} error={fieldErr('credit.minimumCreditMinor')}>
            <MoneyInput id="s-min" currency={currency} value={s.credit.minimumCreditMinor} onChange={(v) => patch((d) => { d.credit.minimumCreditMinor = v ?? 0; return d; })} />
          </Field>
          <Field label={t('dash.settings.expiry')} htmlFor="s-expiry" labelAfter={<InfoTip text={t('dash.settings.tip.expiry')} />} help={t('dash.settings.expiryHelp')} error={fieldErr('credit.expiryMonths')}>
            <Input id="s-expiry" type="number" min={1} max={120} value={s.credit.expiryMonths ?? ''} onChange={(e) => patch((d) => { d.credit.expiryMonths = e.target.value ? Number(e.target.value) : undefined; return d; })} />
          </Field>
          <div className="self-end pb-2"><Toggle id="s-gcemail" label={t('dash.settings.sendGiftCardEmail')} tip={t('dash.settings.tip.sendGiftCardEmail')} checked={s.credit.sendGiftCardEmail} onChange={(v) => patch((d) => { d.credit.sendGiftCardEmail = v; return d; })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('dash.settings.pages')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t('dash.settings.formPage')} htmlFor="s-form" labelAfter={<InfoTip text={t('dash.settings.tip.formPage')} />} help={t('dash.settings.pagesHelp')} error={fieldErr('pages.formPageUrl')}>
            <Input id="s-form" type="url" placeholder="https://" value={s.pages.formPageUrl} onChange={(e) => patch((d) => { d.pages.formPageUrl = e.target.value.trim(); return d; })} />
          </Field>
          <Field label={t('dash.settings.statusPage')} htmlFor="s-status" labelAfter={<InfoTip text={t('dash.settings.tip.statusPage')} />} error={fieldErr('pages.statusPageUrl')}>
            <Input id="s-status" type="url" placeholder="https://" value={s.pages.statusPageUrl} onChange={(e) => patch((d) => { d.pages.statusPageUrl = e.target.value.trim(); return d; })} />
          </Field>
        </CardContent>
      </Card>

      <Card id="terms">
        <CardHeader>
          <CardTitle>{t('dash.settings.terms')}</CardTitle>
          <CardDescription>
            {t('dash.settings.termsHelp')} {t('dash.settings.termsTemplateHelp')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!hasTerms(s.termsHtml) && <Alert variant="warning">{t('dash.settings.termsMissing')}</Alert>}
          <Field label={t('dash.settings.terms')} htmlFor="s-terms" error={fieldErr('termsHtml')}>
            <Suspense fallback={<Skeleton className="h-56" />}>
              <TermsEditor id="s-terms" value={s.termsHtml} describedBy={errors.termsHtml ? 's-terms-error' : undefined} onChange={(html) => patch((d) => { d.termsHtml = html; return d; })} />
            </Suspense>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('dash.settings.customItems')}</CardTitle>
          <CardDescription>{t('dash.settings.customItemsHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="self-end pb-2">
            <Toggle id="s-custom" label={t('dash.settings.customItemsEnabled')} checked={s.customItems.enabled} onChange={(v) => patch((d) => { d.customItems.enabled = v; return d; })} />
          </div>
          {s.customItems.enabled && (
            <Field
              label={t('dash.settings.customItemsPhotos')}
              htmlFor="s-custom-photos"
              labelAfter={<InfoTip text={t('dash.settings.tip.customItemsPhotos')} />}
              help={entitlements.mediaUploads ? undefined : t('dash.settings.customItemsNoUploads')}
              error={fieldErr('customItems.photoMinimum')}
            >
              <Input id="s-custom-photos" type="number" min={0} max={10} value={s.customItems.photoMinimum} onChange={(e) => patch((d) => { d.customItems.photoMinimum = Number(e.target.value); return d; })} />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('dash.settings.workflow')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Toggle id="s-cancel" label={t('dash.settings.allowCancel')} tip={t('dash.settings.tip.allowCancel')} checked={s.allowCustomerCancel} onChange={(v) => patch((d) => { d.allowCustomerCancel = v; return d; })} />
          <Field label={t('dash.settings.revisedExpiry')} htmlFor="s-rexp" labelAfter={<InfoTip text={t('dash.settings.tip.revisedExpiry')} />} help={t('dash.settings.revisedExpiryHelp')}>
            <Input id="s-rexp" type="number" min={1} max={60} value={s.revisedOfferExpiryDays} onChange={(e) => patch((d) => { d.revisedOfferExpiryDays = Number(e.target.value); return d; })} />
          </Field>
          <Field
            label={t('dash.settings.retention')}
            htmlFor="s-ret"
            labelAfter={<InfoTip text={t('dash.settings.tip.retention')} />}
            help={`${t('dash.settings.retentionHelp')} ${entitlements.customMediaRetention ? t('dash.plan.retentionMax', { days: entitlements.maxMediaRetentionDays }) : t('dash.plan.retentionFixed', { days: entitlements.maxMediaRetentionDays })}`}
          >
            <Input
              id="s-ret"
              type="number"
              min={1}
              max={entitlements.maxMediaRetentionDays}
              disabled={!entitlements.customMediaRetention}
              value={entitlements.customMediaRetention ? s.mediaRetentionDays : entitlements.maxMediaRetentionDays}
              onChange={(e) => patch((d) => { d.mediaRetentionDays = Number(e.target.value); return d; })}
            />
          </Field>
          <Field label={t('dash.settings.locale')} htmlFor="s-locale" labelAfter={<InfoTip text={t('dash.settings.tip.locale')} />}>
            <NativeSelect id="s-locale" value={s.defaultLocale} onChange={(e) => patch((d) => { d.defaultLocale = e.target.value; return d; })}>
              {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l}</option>)}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button type="submit" busy={saving} disabled={handoffMissing}>{t('dash.save')}</Button></div>
    </form>
  );
}
