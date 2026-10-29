import React, { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Database, FileText, Gift, ListChecks, PackagePlus, Store, Truck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_LOCALES } from '../../lib/i18n';
import type { Settings } from '../../lib/schemas/domain';
import { isCompleteAddress } from '../../lib/location/address';
import { hasTerms, termsEditorValue } from '../../lib/terms';
import { AdminApiError, adminApi } from '../api';
import { LoadError, MoneyInput, PageHeader } from '../components';
import { useDashboard, useLoad } from '../context';
import { AddressFields } from '../address';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, NativeSelect, Textarea } from '../ui/input';
import { Field, Label } from '../ui/label';
import { Alert, Skeleton } from '../ui/misc';
import { Switch } from '../ui/switch';
import { InfoTip } from '../ui/tooltip';

// Quill touches `document` on import, so it loads only in the browser.
const TermsEditor = lazy(() => import('../TermsEditor'));

// Helpers are defined at module level so they aren't remounted on every render (keeps keyboard focus).

function Section({ id, icon: Icon, title, description, children }: { id?: string; icon: LucideIcon; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="gap-0 py-0">
      <CardHeader className="flex-row items-start gap-3 border-b py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true"><Icon className="size-[18px]" /></span>
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="py-1">{children}</CardContent>
    </Card>
  );
}

/** One setting: label, tooltip and help on the left, its control on the right (stacked on phones). */
function Row({ label, htmlFor, tip, help, error, children }: { label: string; htmlFor: string; tip?: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:gap-8">
      <div className="grid gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor}>{label}</Label>
          {tip && <InfoTip text={tip} />}
        </div>
        {help && <p id={`${htmlFor}-help`} className="text-xs text-muted-foreground">{help}</p>}
      </div>
      <div className="grid gap-1.5">
        {children}
        {error && <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function SwitchRow({ id, label, tip, help, checked, onChange }: { id: string; label: string; tip?: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} htmlFor={id} tip={tip} help={help}>
      <Switch id={id} className="sm:justify-self-end" checked={checked} onCheckedChange={onChange} aria-describedby={help ? `${id}-help` : undefined} />
    </Row>
  );
}

/** A hand-off method as a selectable card; the whole card reflects whether it's on. */
function MethodCard({ id, icon: Icon, label, description, checked, onChange, lockedNote }: { id: string; icon: LucideIcon; label: string; description: string; checked: boolean; onChange: (v: boolean) => void; lockedNote?: string }) {
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-4 transition-colors', checked ? 'border-primary bg-primary/5' : 'bg-background', lockedNote && 'opacity-75')}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', checked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} aria-hidden="true">
        <Icon className="size-[18px]" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
        {lockedNote && <p id={`${id}-plan`} className="text-xs font-medium text-muted-foreground">{lockedNote}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={!!lockedNote} onCheckedChange={onChange} aria-describedby={lockedNote ? `${id}-plan` : undefined} />
    </div>
  );
}

export function SettingsPage() {
  const { t, errorText, entitlements } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => adminApi.settings(), []);
  // `saved` is what the server has; `draft` is the form. They differ while there are unsaved changes.
  const [saved, setSaved] = useState<Settings>();
  const [draft, setDraft] = useState<Settings>();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    const loaded = { ...data, termsHtml: termsEditorValue(data.termsHtml) };
    setSaved(loaded);
    setDraft(loaded);
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
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const next = await adminApi.saveSettings(s);
      setSaved(next);
      setDraft(next);
      toast.success(t('dash.saved'));
    } catch (err) {
      if (err instanceof AdminApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof AdminApiError && err.fields ? t('dash.saveError') : errorText(err));
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setDraft(saved);
    setErrors({});
  };

  const methods = [
    { key: 'dropOff', icon: Store },
    { key: 'shipIn', icon: Truck },
  ] as const;

  return (
    <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <PageHeader title={t('dash.settings.title')} subtitle={t('dash.settings.subtitle')} actions={<Button type="submit" busy={saving} disabled={!dirty || handoffMissing}>{t('dash.save')}</Button>} />

      <Section icon={Store} title={t('dash.settings.handoff')} description={t('dash.settings.handoffDesc')}>
        <div className="grid gap-4 py-4">
          {handoffMissing && <Alert variant="destructive">{t('dash.settings.handoffRequired')}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            {methods.map(({ key: m, icon }) => (
              <MethodCard
                key={m}
                id={`h-${m}`}
                icon={icon}
                label={t(`dash.settings.${m}`)}
                description={t(`dash.settings.tip.${m}`)}
                checked={methodOn(m)}
                onChange={(v) => patch((d) => { d.handoff[m].enabled = v; return d; })}
                lockedNote={m === 'shipIn' && !entitlements.shipIn ? t('dash.plan.shipInRequiresPro') : undefined}
              />
            ))}
          </div>
          {methods.filter(({ key }) => methodOn(key)).map(({ key: m }) => (
            <fieldset key={m} className="grid gap-4 rounded-lg border bg-muted/30 p-4">
              <legend className="px-1 text-sm font-semibold">{t('dash.settings.handoffDetails', { method: t(`dash.settings.${m}`) })}</legend>
              <div className="grid gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">{t('dash.settings.address')}<InfoTip text={t('dash.settings.tip.address')} /></p>
                <AddressFields idPrefix={`h-${m}`} value={s.handoff[m].location} onChange={(loc) => patch((d) => { d.handoff[m].location = loc; return d; })} />
                {s.handoff[m].address && !isCompleteAddress(s.handoff[m].location) && (
                  <p className="text-xs text-muted-foreground">{t('dash.settings.addressLegacy', { address: s.handoff[m].address.replace(/\n/g, ', ') })}</p>
                )}
                {Object.keys(errors).some((k) => k.startsWith(`handoff.${m}.location`)) && <p className="text-xs font-medium text-destructive" role="alert">{t('dash.saveError')}</p>}
              </div>
              <Field label={t('dash.settings.instructions')} htmlFor={`h-${m}-ins`} labelAfter={<InfoTip text={t('dash.settings.tip.instructions')} />} error={fieldErr(`handoff.${m}.instructions`)}>
                <Textarea id={`h-${m}-ins`} rows={3} value={s.handoff[m].instructions} maxLength={2000} onChange={(e) => patch((d) => { d.handoff[m].instructions = e.target.value; return d; })} />
              </Field>
              {m === 'shipIn' && (
                <div className="flex items-center gap-3">
                  <Switch id="h-tracking" checked={s.handoff.shipIn.allowTracking} onCheckedChange={(v) => patch((d) => { d.handoff.shipIn.allowTracking = v; return d; })} />
                  <Label htmlFor="h-tracking">{t('dash.settings.allowTracking')}</Label>
                  <InfoTip text={t('dash.settings.tip.allowTracking')} />
                </div>
              )}
            </fieldset>
          ))}
        </div>
      </Section>

      <Section icon={Gift} title={t('dash.settings.credit')} description={t('dash.settings.creditDesc')}>
        <Row label={t('dash.settings.minimumCredit', { currency })} htmlFor="s-min" tip={t('dash.settings.tip.minimumCredit')} error={fieldErr('credit.minimumCreditMinor')}>
          <MoneyInput id="s-min" currency={currency} value={s.credit.minimumCreditMinor} onChange={(v) => patch((d) => { d.credit.minimumCreditMinor = v ?? 0; return d; })} />
        </Row>
        <Row label={t('dash.settings.expiry')} htmlFor="s-expiry" tip={t('dash.settings.tip.expiry')} help={t('dash.settings.expiryHelp')} error={fieldErr('credit.expiryMonths')}>
          <Input id="s-expiry" type="number" min={1} max={120} aria-describedby="s-expiry-help" value={s.credit.expiryMonths ?? ''} onChange={(e) => patch((d) => { d.credit.expiryMonths = e.target.value ? Number(e.target.value) : undefined; return d; })} />
        </Row>
        <SwitchRow id="s-gcemail" label={t('dash.settings.sendGiftCardEmail')} tip={t('dash.settings.tip.sendGiftCardEmail')} checked={s.credit.sendGiftCardEmail} onChange={(v) => patch((d) => { d.credit.sendGiftCardEmail = v; return d; })} />
      </Section>

      <Section id="terms" icon={FileText} title={t('dash.settings.terms')} description={<>{t('dash.settings.termsHelp')} {t('dash.settings.termsTemplateHelp')}</>}>
        <div className="grid gap-4 py-4">
          {!hasTerms(s.termsHtml) && <Alert variant="warning">{t('dash.settings.termsMissing')}</Alert>}
          <Field label={t('dash.settings.terms')} htmlFor="s-terms" error={fieldErr('termsHtml')}>
            <Suspense fallback={<Skeleton className="h-56" />}>
              <TermsEditor id="s-terms" value={s.termsHtml} describedBy={errors.termsHtml ? 's-terms-error' : undefined} onChange={(html) => patch((d) => { d.termsHtml = html; return d; })} />
            </Suspense>
          </Field>
        </div>
      </Section>

      <Section icon={PackagePlus} title={t('dash.settings.customItems')} description={t('dash.settings.customItemsHelp')}>
        <SwitchRow id="s-custom" label={t('dash.settings.customItemsEnabled')} checked={s.customItems.enabled} onChange={(v) => patch((d) => { d.customItems.enabled = v; return d; })} />
        {s.customItems.enabled && (
          <Row
            label={t('dash.settings.customItemsPhotos')}
            htmlFor="s-custom-photos"
            tip={t('dash.settings.tip.customItemsPhotos')}
            help={entitlements.mediaUploads ? undefined : t('dash.settings.customItemsNoUploads')}
            error={fieldErr('customItems.photoMinimum')}
          >
            <Input id="s-custom-photos" type="number" min={0} max={10} aria-describedby={entitlements.mediaUploads ? undefined : 's-custom-photos-help'} value={s.customItems.photoMinimum} onChange={(e) => patch((d) => { d.customItems.photoMinimum = Number(e.target.value); return d; })} />
          </Row>
        )}
      </Section>

      <Section icon={ListChecks} title={t('dash.settings.workflow')} description={t('dash.settings.workflowDesc')}>
        <SwitchRow id="s-cancel" label={t('dash.settings.allowCancel')} tip={t('dash.settings.tip.allowCancel')} checked={s.allowCustomerCancel} onChange={(v) => patch((d) => { d.allowCustomerCancel = v; return d; })} />
        <Row label={t('dash.settings.revisedExpiry')} htmlFor="s-rexp" tip={t('dash.settings.tip.revisedExpiry')} help={t('dash.settings.revisedExpiryHelp')}>
          <Input id="s-rexp" type="number" min={1} max={60} aria-describedby="s-rexp-help" value={s.revisedOfferExpiryDays} onChange={(e) => patch((d) => { d.revisedOfferExpiryDays = Number(e.target.value); return d; })} />
        </Row>
      </Section>

      <Section icon={Database} title={t('dash.settings.data')} description={t('dash.settings.dataDesc')}>
        <Row
          label={t('dash.settings.retention')}
          htmlFor="s-ret"
          tip={t('dash.settings.tip.retention')}
          help={`${t('dash.settings.retentionHelp')} ${entitlements.customMediaRetention ? t('dash.plan.retentionMax', { days: entitlements.maxMediaRetentionDays }) : t('dash.plan.retentionFixed', { days: entitlements.maxMediaRetentionDays })}`}
        >
          <Input
            id="s-ret"
            type="number"
            min={1}
            max={entitlements.maxMediaRetentionDays}
            disabled={!entitlements.customMediaRetention}
            aria-describedby="s-ret-help"
            value={entitlements.customMediaRetention ? s.mediaRetentionDays : entitlements.maxMediaRetentionDays}
            onChange={(e) => patch((d) => { d.mediaRetentionDays = Number(e.target.value); return d; })}
          />
        </Row>
        <Row label={t('dash.settings.locale')} htmlFor="s-locale" tip={t('dash.settings.tip.locale')}>
          <NativeSelect id="s-locale" value={s.defaultLocale} onChange={(e) => patch((d) => { d.defaultLocale = e.target.value; return d; })}>
            {SUPPORTED_LOCALES.map((l) => <option key={l} value={l}>{new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l}</option>)}
          </NativeSelect>
        </Row>
      </Section>

      {dirty && (
        <div className="sticky bottom-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg" role="region" aria-label={t('dash.settings.unsaved')}>
          <p className="text-sm font-medium">{t('dash.settings.unsaved')}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={discard} disabled={saving}>{t('dash.settings.discard')}</Button>
            <Button type="submit" busy={saving} disabled={handoffMissing}>{t('dash.save')}</Button>
          </div>
        </div>
      )}
    </form>
  );
}
