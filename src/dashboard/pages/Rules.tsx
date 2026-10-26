import React, { useEffect, useState } from 'react';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Adjustment, ConditionQuestion, Rule, RuleInput } from '../../lib/schemas/domain';
import { ruleInputSchema, VIDEO_MODES } from '../../lib/schemas/domain';
import { AdminApiError, adminApi } from '../api';
import { LoadError, MoneyInput, PageHeader, useMoney } from '../components';
import { useDashboard, useLoad } from '../context';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input, NativeSelect, Textarea } from '../ui/input';
import { Field, Label } from '../ui/label';
import { Alert, Skeleton } from '../ui/misc';
import { Switch } from '../ui/switch';

const shortId = () => Math.random().toString(36).slice(2, 10);

const emptyRule = (isBasic?: boolean): RuleInput => ({
  name: '',
  scope: isBasic ? 'product' : 'all',
  productIds: [],
  payoutPercentage: 40,
  conditionQuestions: [],
  photoMinimum: 2,
  videoMode: 'off',
  videoMaxSeconds: 60,
  priority: 0,
  enabled: true,
});

type NumericRuleField = 'payoutPercentage' | 'photoMinimum' | 'videoMaxSeconds' | 'priority';

export function RulesPage({ editId }: { editId?: string }) {
  const { t, go, entitlements } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => Promise.all([adminApi.rules(), adminApi.settings()]), []);
  if (error) return <LoadError onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64" />;
  const [rules, settings] = data;

  if (editId) {
    const existing = editId === 'new' ? undefined : rules.find((r) => r._id === editId);
    return <RuleEditor rule={existing} currency={settings.currency} onDone={() => { reload(); go('/rules'); }} />;
  }

  const canAddRule = rules.length < entitlements.maxRules;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('dash.rules.title')}
        subtitle={t('dash.rules.subtitle')}
        actions={
          <Button
            disabled={!canAddRule}
            title={!canAddRule ? t('dash.plan.ruleLimitReached') : undefined}
            onClick={() => go('/rules/new')}
          >
            <Plus aria-hidden="true" />{t('dash.rules.new')}
          </Button>
        }
      />
      <Alert>{t('dash.rules.calcHelp')}</Alert>
      {rules.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{t('dash.rules.empty')}</CardContent></Card>
      ) : (
        <ul className="grid gap-3">
          {rules.map((r) => (
            <li key={r._id}>
              <Card className="py-4">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <p className="flex items-center gap-2 font-medium">{r.name}<Badge variant={r.enabled ? 'success' : 'outline'}>{r.enabled ? t('dash.rules.enabled') : t('dash.rules.disabled')}</Badge></p>
                    <p className="text-sm text-muted-foreground">
                      {t(`dash.rules.scope.${r.scope}`)} · {t('dash.rules.summary', { payout: r.payoutPercentage, questions: r.conditionQuestions.length, photos: r.photoMinimum })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => go(`/rules/${r._id}`)} aria-label={t('dash.rules.edit', { name: r.name })}><Pencil aria-hidden="true" />{t('dash.rules.edit', { name: '' }).trim()}</Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleEditor({ rule, currency, onDone }: { rule?: Rule; currency: string; onDone: () => void }) {
  const { t, errorText, entitlements, isBasic } = useDashboard();
  const money = useMoney();
  const [draft, setDraft] = useState<RuleInput>(() => (rule ? { ...rule } : emptyRule(isBasic)));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== String(k) && !key.startsWith(`${String(k)}.`))));
  };
  const setNumber = <K extends NumericRuleField>(k: K, value: string) =>
    set(k, value === '' ? Number.NaN : Number(value));

  // Live preview against the server's offer engine.
  const [previewPrice, setPreviewPrice] = useState<number | undefined>(100 * 100);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ text: string; upTo?: string }>();
  useEffect(() => {
    if (!ruleInputSchema.safeParse(draft).success) {
      setPreview(undefined);
      return;
    }
    if (!previewPrice) return setPreview(undefined);
    const timer = setTimeout(() => {
      adminApi.previewRule(draft, previewPrice, currency, previewAnswers).then(
        ({ result, upToMinor }) => setPreview({
          text: result.eligible ? t('dash.rule.previewResult', { amount: money(result.breakdown.offerMinor, currency) }) : t('dash.rule.previewRejected'),
          upTo: t('dash.rule.previewUpTo', { amount: money(upToMinor, currency) }),
        }),
        () => setPreview(undefined),
      );
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft), previewPrice, JSON.stringify(previewAnswers), currency]);

  const save = async () => {
    setErrors({});
    const parsed = ruleInputSchema.safeParse(draft);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join('.');
        if (key) fields[key] = issue.message;
        const root = issue.path[0];
        if (root !== undefined) fields[String(root)] = issue.message;
      }
      setErrors(fields);
      toast.error(t('dash.saveError'));
      return;
    }

    setSaving(true);
    try {
      await adminApi.saveRule(parsed.data, rule?._id);
      toast.success(t('dash.rule.saved'));
      onDone();
    } catch (err) {
      if (err instanceof AdminApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof AdminApiError && err.fields ? t('dash.saveError') : errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!rule) return;
    setDeleting(true);
    try {
      await adminApi.deleteRule(rule._id);
      toast.success(t('dash.rule.deleted'));
      onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const updateQuestion = (i: number, q: Partial<ConditionQuestion>) => set('conditionQuestions', draft.conditionQuestions.map((x, n) => (n === i ? { ...x, ...q } : x)));
  const err = (k: string) => (errors[k] ? t('dash.field.required') : undefined);
  const numberError = (k: string) => (errors[k] ? t('dash.field.invalidNumber') : undefined);

  const scopeRestricted = isBasic && (draft.scope !== 'product' || draft.productIds.length > 1);

  return (
    <div className="rule-editor grid gap-6">
      <PageHeader
        title={rule ? rule.name : t('dash.rules.new')}
        actions={
          <>
            <Button variant="outline" onClick={onDone} disabled={saving}>{t('dash.cancel')}</Button>
            {rule && <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 aria-hidden="true" />{t('dash.rules.delete')}</Button>}
            <Button
              busy={saving}
              disabled={saving || scopeRestricted}
              title={scopeRestricted ? t('dash.plan.singleProductOnly') : undefined}
              onClick={save}
            >
              {t('dash.save')}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={t('dash.rule.name')} htmlFor="r-name" required error={err('name')}>
                <Input id="r-name" value={draft.name} maxLength={100} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label={t('dash.rule.scope')} htmlFor="r-scope">
                <NativeSelect id="r-scope" value={draft.scope} onChange={(e) => set('scope', e.target.value as RuleInput['scope'])}>
                  {(['all', 'category', 'product'] as const).map((s) => {
                    const disabled =
                      (s === 'all' && !entitlements.allowAllProductsScope) ||
                      (s === 'category' && !entitlements.allowCategoryScope);
                    return (
                      <option key={s} value={s} disabled={disabled}>
                        {t(`dash.rules.scope.${s}`)} {disabled ? `(${t('dash.plan.scopeAllDisabled')})` : ''}
                      </option>
                    );
                  })}
                </NativeSelect>
              </Field>
              {draft.scope === 'category' && (
                <Field label={t('dash.rule.categoryId')} htmlFor="r-cat" help={t('dash.rule.categoryHelp')} required error={err('categoryId')}>
                  <Input id="r-cat" value={draft.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value.trim() || undefined)} />
                </Field>
              )}
              {draft.scope === 'product' && (
                <Field
                  label={t('dash.rule.productIds')}
                  htmlFor="r-prods"
                  help={isBasic ? t('dash.plan.singleProductOnly') : t('dash.rule.productIdsHelp')}
                  required
                  error={err('productIds')}
                >
                  <Textarea
                    id="r-prods"
                    value={draft.productIds.join('\n')}
                    placeholder={isBasic ? 'Enter 1 product ID' : undefined}
                    onChange={(e) => {
                      const ids = e.target.value.split(/\s+/).filter(Boolean);
                      set('productIds', isBasic ? ids.slice(0, 1) : ids);
                    }}
                  />
                </Field>
              )}
              <Field label={t('dash.rule.payout')} htmlFor="r-payout" required error={numberError('payoutPercentage')}>
                <Input id="r-payout" type="number" min={0} max={100} step={0.01} required aria-invalid={!!errors.payoutPercentage} value={Number.isFinite(draft.payoutPercentage) ? draft.payoutPercentage : ''} onChange={(e) => setNumber('payoutPercentage', e.target.value)} />
              </Field>
              <Field label={t('dash.rule.min', { currency })} htmlFor="r-min" error={numberError('minimumOfferMinor')}>
                <MoneyInput id="r-min" currency={currency} value={draft.minimumOfferMinor} onChange={(v) => set('minimumOfferMinor', v)} />
              </Field>
              <Field label={t('dash.rule.max', { currency })} htmlFor="r-max" error={numberError('maximumOfferMinor')}>
                <MoneyInput id="r-max" currency={currency} value={draft.maximumOfferMinor} onChange={(v) => set('maximumOfferMinor', v)} />
              </Field>
              <Field label={t('dash.rule.photoMinimum')} htmlFor="r-photos" error={numberError('photoMinimum')}>
                <Input id="r-photos" type="number" min={0} max={10} step={1} aria-invalid={!!errors.photoMinimum} value={Number.isFinite(draft.photoMinimum) ? draft.photoMinimum : ''} onChange={(e) => setNumber('photoMinimum', e.target.value)} />
              </Field>
              <Field label={t('dash.rule.videoMode')} htmlFor="r-video">
                <NativeSelect id="r-video" value={draft.videoMode} onChange={(e) => set('videoMode', e.target.value as RuleInput['videoMode'])}>
                  {VIDEO_MODES.map((m) => <option key={m} value={m}>{t(`dash.rule.video.${m}`)}</option>)}
                </NativeSelect>
              </Field>
              {draft.videoMode !== 'off' && (
                <Field label={t('dash.rule.videoMax')} htmlFor="r-vmax" error={numberError('videoMaxSeconds')}>
                  <Input id="r-vmax" type="number" min={5} max={300} step={1} aria-invalid={!!errors.videoMaxSeconds} value={Number.isFinite(draft.videoMaxSeconds) ? draft.videoMaxSeconds : ''} onChange={(e) => setNumber('videoMaxSeconds', e.target.value)} />
                </Field>
              )}
              <Field label={t('dash.rule.priority')} htmlFor="r-prio" labelAfter={<PriorityTooltip text={t('dash.rule.priorityHelp')} />} error={numberError('priority')}>
                <Input id="r-prio" type="number" min={0} max={1000} step={1} aria-invalid={!!errors.priority} value={Number.isFinite(draft.priority) ? draft.priority : ''} onChange={(e) => setNumber('priority', e.target.value)} />
              </Field>
              <div className="flex items-center gap-3 self-end pb-2">
                <Switch id="r-enabled" checked={draft.enabled} onCheckedChange={(v) => set('enabled', v)} />
                <Label htmlFor="r-enabled">{t('dash.rule.enabled')}</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('dash.rule.questions')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => set('conditionQuestions', [...draft.conditionQuestions, {
                id: shortId(), label: '', required: true,
                options: [{ id: shortId(), label: '', adjustment: { kind: 'percent', basisPoints: 0 } }, { id: shortId(), label: '', adjustment: { kind: 'percent', basisPoints: -2000 } }],
              }])}><Plus aria-hidden="true" />{t('dash.rule.addQuestion')}</Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              {errors.conditionQuestions && <Alert variant="destructive">{t('dash.saveError')}</Alert>}
              {draft.conditionQuestions.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <p>{t('dash.rule.noQuestions')}</p>
                </div>
              )}
              {draft.conditionQuestions.map((q, qi) => (
                <fieldset key={q.id} className="grid gap-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="px-1 text-sm font-medium">{t('dash.rule.questionNumber', { number: qi + 1 })}</legend>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => set('conditionQuestions', draft.conditionQuestions.filter((_, n) => n !== qi))}
                      aria-label={t('dash.rule.removeQuestion')}
                    >
                      <Trash2 aria-hidden="true" />
                      {t('dash.rule.removeQuestion')}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Field label={t('dash.rule.question')} htmlFor={`q-${q.id}`} required>
                      <Input id={`q-${q.id}`} value={q.label} maxLength={200} onChange={(e) => updateQuestion(qi, { label: e.target.value })} />
                    </Field>
                    <div className="flex items-center gap-2 self-end pb-2">
                      <Switch id={`qr-${q.id}`} checked={q.required} onCheckedChange={(v) => updateQuestion(qi, { required: v })} />
                      <Label htmlFor={`qr-${q.id}`}>{t('dash.rule.questionRequired')}</Label>
                    </div>
                  </div>
                  <Field label={t('dash.rule.questionHelp')} htmlFor={`qh-${q.id}`}>
                    <Input id={`qh-${q.id}`} value={q.helpText ?? ''} maxLength={500} onChange={(e) => updateQuestion(qi, { helpText: e.target.value || undefined })} />
                  </Field>
                  <div className="grid gap-2">
                    {q.options.map((o, oi) => {
                      const setOption = (patch: Partial<typeof o>) => updateQuestion(qi, { options: q.options.map((x, n) => (n === oi ? { ...x, ...patch } : x)) });
                      const setAdj = (a: Adjustment) => setOption({ adjustment: a });
                      return (
                        <div key={o.id} className="grid items-end gap-2 sm:grid-cols-[2fr_1.4fr_1fr_auto]">
                          <Field label={t('dash.rule.option')} htmlFor={`o-${o.id}`}>
                            <Input id={`o-${o.id}`} value={o.label} maxLength={120} onChange={(e) => setOption({ label: e.target.value })} />
                          </Field>
                          <Field label={t('dash.rule.adjustment')} htmlFor={`ok-${o.id}`}>
                            <NativeSelect id={`ok-${o.id}`} value={o.adjustment.kind} onChange={(e) => {
                              const k = e.target.value as Adjustment['kind'];
                              setAdj(k === 'percent' ? { kind: 'percent', basisPoints: 0 } : k === 'fixed' ? { kind: 'fixed', amountMinor: 0 } : { kind: 'reject' });
                            }}>
                              <option value="percent">{t('dash.rule.adj.percent')}</option>
                              <option value="fixed">{t('dash.rule.adj.fixed')}</option>
                              <option value="reject">{t('dash.rule.adj.reject')}</option>
                            </NativeSelect>
                          </Field>
                          <Field label={t('dash.rule.adjValue')} htmlFor={`ov-${o.id}`}>
                            {o.adjustment.kind === 'percent' ? (
                              <Input id={`ov-${o.id}`} type="number" min={-100} max={100} step={0.01} aria-invalid={!!errors.conditionQuestions} value={Number.isFinite(o.adjustment.basisPoints) ? o.adjustment.basisPoints / 100 : ''} onChange={(e) => {
                                const value = e.target.value;
                                const basisPoints = Number(value) * 100;
                                const roundedBasisPoints = Math.round(basisPoints);
                                const isValidPrecision = value !== '' && Number.isFinite(basisPoints) && Math.abs(basisPoints - roundedBasisPoints) < 1e-9;
                                setAdj({ kind: 'percent', basisPoints: isValidPrecision ? roundedBasisPoints : Number.NaN });
                              }} />
                            ) : o.adjustment.kind === 'fixed' ? (
                              <SignedMoney id={`ov-${o.id}`} currency={currency} value={o.adjustment.amountMinor} onChange={(v) => setAdj({ kind: 'fixed', amountMinor: v })} />
                            ) : <Input id={`ov-${o.id}`} disabled value="—" />}
                          </Field>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('dash.rule.removeOption')}
                            title={q.options.length <= 2 ? t('dash.rule.minOptionsHelp') : undefined}
                            disabled={q.options.length <= 2}
                            onClick={() => updateQuestion(qi, { options: q.options.filter((_, n) => n !== oi) })}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button variant="outline" size="sm" disabled={q.options.length >= 10} onClick={() => updateQuestion(qi, { options: [...q.options, { id: shortId(), label: '', adjustment: { kind: 'percent', basisPoints: 0 } }] })}><Plus aria-hidden="true" />{t('dash.rule.addOption')}</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => set('conditionQuestions', draft.conditionQuestions.filter((_, n) => n !== qi))}
                    >
                      <Trash2 aria-hidden="true" />
                      {t('dash.rule.removeQuestion')}
                    </Button>
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="content-start self-start">
          <CardHeader>
            <CardTitle>{t('dash.rule.preview')}</CardTitle>
            <CardDescription>{t('dash.rules.calcHelp')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field label={t('dash.rule.previewPrice', { currency })} htmlFor="pv-price">
              <MoneyInput id="pv-price" currency={currency} value={previewPrice} onChange={setPreviewPrice} />
            </Field>
            {draft.conditionQuestions.map((q) => (
              <Field key={q.id} label={q.label || t('dash.rule.question')} htmlFor={`pv-${q.id}`}>
                <NativeSelect id={`pv-${q.id}`} value={previewAnswers[q.id] ?? ''} onChange={(e) => setPreviewAnswers((a) => {
                  const next = { ...a };
                  if (e.target.value) next[q.id] = e.target.value; else delete next[q.id];
                  return next;
                })}>
                  <option value="">—</option>
                  {q.options.map((o) => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}
                </NativeSelect>
              </Field>
            ))}
            <div role="status" aria-live="polite" className="grid gap-1 text-sm">
              {preview && <p className="text-lg font-semibold">{preview.text}</p>}
              {preview?.upTo && <p className="text-muted-foreground">{preview.upTo}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dash.rules.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('dash.rules.deleteConfirm', { name: rule?.name ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="outline">{t('dash.cancel')}</Button></AlertDialogCancel>
            <Button variant="destructive" busy={deleting} onClick={remove}>{t('dash.rules.delete')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Money input that allows a leading minus sign for deductions. */
function SignedMoney({ id, currency, value, onChange }: { id: string; currency: string; value: number; onChange: (v: number) => void }) {
  const { t } = useDashboard();
  const negative = value < 0;
  return (
    <div className="flex gap-1">
      <NativeSelect aria-label={t('dash.rule.signLabel')} className="w-14 px-1" value={negative ? '-' : '+'} onChange={(e) => onChange(Math.abs(value) * (e.target.value === '-' ? -1 : 1))}>
        <option value="+">+</option>
        <option value="-">−</option>
      </NativeSelect>
      <MoneyInput id={id} currency={currency} value={Math.abs(value)} onChange={(v) => onChange((v ?? 0) * (negative ? -1 : 1))} />
    </div>
  );
}

function PriorityTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-xs font-normal text-background opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
