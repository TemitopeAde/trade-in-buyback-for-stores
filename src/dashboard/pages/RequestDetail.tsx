import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatDateTime } from '../../lib/i18n';
import { toPublicMediaUrl } from '../../lib/media';
import type { AdminTradeInDetail, MerchantAction } from '../../lib/schemas/admin';
import { AdminApiError, adminApi, newKey } from '../api';
import { LoadError, MoneyInput, PageHeader, StatusBadge, useMoney } from '../components';
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
import { Input, Textarea } from '../ui/input';
import { Field } from '../ui/label';
import { Separator, Skeleton } from '../ui/misc';
import { DeliveryLog } from './Notifications';

const NEEDS_REASON: MerchantAction[] = ['reject', 'reject_after_inspection', 'send_revised_offer'];
const NEEDS_NOTES: MerchantAction[] = ['confirm_value', 'send_revised_offer', 'reject_after_inspection'];
const DESTRUCTIVE: MerchantAction[] = ['reject', 'reject_after_inspection', 'cancel', 'decline_revised_offer'];

export function RequestDetailPage({ id }: { id: string }) {
  const { t, go, locale } = useDashboard();
  const money = useMoney();
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.detail(id), [id]);

  if (error) return <LoadError onRetry={reload} />;
  if (loading && !data) return <div className="grid gap-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  if (!data) return null;
  const d = data;
  const b = d.offerBreakdown;

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => go('/requests')}><ArrowLeft className="rtl:rotate-180" aria-hidden="true" />{t('dash.back')}</Button>
      </div>
      <PageHeader
        title={d.reference}
        subtitle={`${d.productTitle} · ${formatDate(d.createdAt, locale)}`}
        actions={<StatusBadge status={d.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle>{t('dash.detail.productAndCustomer')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                {toPublicMediaUrl(d.productImageUrl) && <img src={toPublicMediaUrl(d.productImageUrl)} alt="" className="size-16 rounded-md object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <div className="grid text-sm">
                  <span className="font-medium">{d.productTitle}</span>
                  {d.orderId && <span className="text-muted-foreground">{t('dash.detail.order', { order: d.orderId.slice(0, 8) })}</span>}
                </div>
              </div>
              <div className="grid text-sm">
                <span className="font-medium">{d.customerName}</span>
                <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${d.customerEmail}`}>{d.customerEmail}</a>
                {d.customerPhone && <span>{d.customerPhone}</span>}
                {d.memberId && <Badge variant="outline" className="mt-1 w-fit">{t('dash.detail.member')}</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('dash.detail.answers')}</CardTitle></CardHeader>
            <CardContent>
              {d.conditionAnswers.length ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {d.conditionAnswers.map((a) => (
                    <div key={a.questionId}><dt className="text-muted-foreground">{a.question}</dt><dd className="font-medium">{a.answer}</dd></div>
                  ))}
                </dl>
              ) : <p className="text-sm text-muted-foreground">{t('dash.detail.noAnswers')}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('dash.detail.breakdown')}</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-1.5 text-sm">
                <Row label={t('dash.detail.basePrice')} value={money(b.basePriceMinor, d.currency)} />
                <Row label={t('dash.detail.payout', { percent: (b.payoutBasisPoints / 100).toString() })} value={money(b.baseOfferMinor, d.currency)} />
                {b.adjustments.map((a) => {
                  const labels = d.conditionAnswers.find((c) => c.questionId === a.questionId);
                  return <Row key={`${a.questionId}-${a.optionId}`} label={t('dash.detail.adjustment', { question: labels?.question ?? a.questionId, answer: labels?.answer ?? a.optionId })} value={`${a.deltaMinor >= 0 ? '+' : ''}${money(a.deltaMinor, d.currency)}`} />;
                })}
                {b.clampedTo && <Row label={t(`dash.detail.clamped.${b.clampedTo}`)} value="" />}
                <Separator className="my-1" />
                <Row label={t('dash.detail.estimate')} value={money(d.estimatedValueMinor, d.currency)} strong />
                {d.revisedValueMinor !== undefined && <Row label={t('dash.detail.revised')} value={money(d.revisedValueMinor, d.currency)} strong />}
                {d.finalValueMinor !== undefined && <Row label={t('dash.detail.final')} value={money(d.finalValueMinor, d.currency)} strong />}
              </dl>
              {d.revisedOfferExpiresAt && d.status === 'revised_offer_pending' && (
                <p className="mt-2 text-xs text-muted-foreground">{t('dash.detail.revisedExpires', { date: formatDate(d.revisedOfferExpiresAt, locale) })}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('dash.detail.media')}</CardTitle></CardHeader>
            <CardContent>
              {d.media.length === 0 ? <p className="text-sm text-muted-foreground">{t('dash.detail.noMedia')}</p> : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {d.media.map((m, i) => (
                    <li key={m.mediaId} className="overflow-hidden rounded-lg border bg-muted">
                      {!m.url ? <div className="grid aspect-video place-items-center text-xs text-muted-foreground">{t('dash.detail.mediaProcessing')}</div>
                        : m.kind === 'video'
                          ? <video src={m.url} controls preload="metadata" className="aspect-video w-full bg-black" aria-label={t('dash.detail.photoAlt', { n: i + 1, item: d.productTitle })} />
                          : <a href={m.url} target="_blank" rel="noreferrer noopener"><img src={m.url} alt={t('dash.detail.photoAlt', { n: i + 1, item: d.productTitle })} className="aspect-square w-full object-cover" loading="lazy" /></a>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('dash.detail.handoff')}</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-1.5 text-sm">
                <Row label={t('dash.detail.handoff')} value={t(d.handoffMethod === 'drop_off' ? 'handoff.drop_off' : 'handoff.ship_in')} />
                {d.trackingNumber && <Row label={t('dash.detail.tracking')} value={d.trackingNumber} />}
                {d.returnStatus && <Row label={t('dash.detail.returnStatus')} value={t(`dash.detail.return.${d.returnStatus as 'pending' | 'returned'}`)} />}
                {d.rejectionReason && <Row label={t('dash.detail.rejection')} value={d.rejectionReason} />}
                {d.inspectionNotes && <Row label={t('dash.detail.inspectionNotes')} value={d.inspectionNotes} />}
                <Row label={t('dash.detail.credit')} value={t(`dash.detail.giftCard.${d.giftCardStatus as 'not_started'}`)} />
                {d.giftCardStatus === 'issued' && <Row label={t('dash.detail.giftCardEmail')} value={t(`dash.detail.giftCardEmail.${d.giftCardEmailStatus ?? 'none'}`)} />}
              </dl>
              {d.status === 'credit_pending' && (d.giftCardStatus === 'failed' || d.giftCardStatus === 'reconcile_required' || d.giftCardStatus === 'not_started') && (
                <CreditRetry detail={d} onUpdated={setData} />
              )}
              {d.giftCardStatus === 'issued' && d.giftCardId && <GiftCardEmail detail={d} onUpdated={setData} />}
            </CardContent>
          </Card>

          {(d.status === 'credit_issued' || (d.status === 'closed' && d.giftCardStatus === 'issued')) && <ResaleCard detail={d} onUpdated={setData} />}

          <EmailsCard tradeInId={d.id} />
        </div>

        <div className="grid content-start gap-6">
          <ActionsCard detail={d} onUpdated={setData} reload={reload} />
          <NotesCard detail={d} onUpdated={setData} />
          <Card>
            <CardHeader><CardTitle>{t('dash.detail.timeline')}</CardTitle></CardHeader>
            <CardContent>
              <ol className="grid gap-3 border-s ps-4">
                {[...d.timeline].reverse().map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                    <p className="font-medium">{e.toStatus ? t(`status.${e.toStatus}`) : e.eventType === 'note.added' ? t('dash.event.note') : t('dash.event.other', { event: e.eventType })}</p>
                    <p className="text-xs text-muted-foreground">{t(`dash.actor.${e.actorType}`)} · <time dateTime={e.at}>{formatDateTime(e.at, locale)}</time></p>
                    {e.reason && <p className="text-xs">{e.reason}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CreditRetry({ detail, onUpdated }: { detail: AdminTradeInDetail; onUpdated: (d: AdminTradeInDetail) => void }) {
  const { t, errorText } = useDashboard();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 grid gap-2">
      <Button variant="outline" busy={busy} onClick={async () => {
        setBusy(true);
        try {
          onUpdated(await adminApi.retryCredit(detail.id));
          toast.success(t('dash.detail.creditRetried'));
        } catch (err) {
          toast.error(errorText(err));
        } finally {
          setBusy(false);
        }
      }}>{t('dash.detail.retryCredit')}</Button>
      <p className="text-xs text-muted-foreground">{t('dash.detail.retryCreditHelp')}</p>
    </div>
  );
}

function GiftCardEmail({ detail, onUpdated }: { detail: AdminTradeInDetail; onUpdated: (d: AdminTradeInDetail) => void }) {
  const { t, errorText } = useDashboard();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 grid gap-2">
      <Button variant="outline" busy={busy} onClick={async () => {
        setBusy(true);
        try {
          const next = await adminApi.sendGiftCardEmail(detail.id);
          onUpdated(next);
          if (next.giftCardEmailStatus === 'sent') toast.success(t('dash.detail.giftCardEmailSent'));
          else toast.error(t('dash.detail.giftCardEmailFailed'));
        } catch (err) {
          toast.error(errorText(err));
        } finally {
          setBusy(false);
        }
      }}>{t(detail.giftCardEmailStatus === 'sent' ? 'dash.detail.resendGiftCardEmail' : 'dash.detail.sendGiftCardEmail')}</Button>
      <p className="text-xs text-muted-foreground">{t('dash.detail.sendGiftCardEmailHelp', { email: detail.customerEmail })}</p>
    </div>
  );
}

function ResaleCard({ detail, onUpdated }: { detail: AdminTradeInDetail; onUpdated: (d: AdminTradeInDetail) => void }) {
  const { t, errorText, entitlements } = useDashboard();
  const [busy, setBusy] = useState(false);
  const status = detail.resaleDraftStatus as 'not_started' | 'pending' | 'created' | 'failed';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dash.detail.resale')}</CardTitle>
        <CardDescription>{t('dash.detail.resaleHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">{t(`dash.detail.resale.${status}`)}</span>
        {status !== 'created' && (
          <Button
            variant="outline"
            busy={busy}
            disabled={!entitlements.resaleDrafts || busy}
            title={!entitlements.resaleDrafts ? t('dash.plan.resaleRequiresPro') : undefined}
            onClick={async () => {
              setBusy(true);
              try {
                onUpdated(await adminApi.createResale(detail.id));
                toast.success(t('dash.detail.resaleCreated'));
              } catch (err) {
                toast.error(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('dash.detail.createResale')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EmailsCard({ tradeInId }: { tradeInId: string }) {
  const { t } = useDashboard();
  const { data } = useLoad(() => adminApi.notifications(tradeInId), [tradeInId]);
  return (
    <Card>
      <CardHeader><CardTitle>{t('dash.detail.emails')}</CardTitle></CardHeader>
      <CardContent>{data ? <DeliveryLog entries={data.history} /> : <Skeleton className="h-16" />}</CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</dd>
    </div>
  );
}

function ActionsCard({ detail, onUpdated, reload }: { detail: AdminTradeInDetail; onUpdated: (d: AdminTradeInDetail) => void; reload: () => void }) {
  const { t, errorText } = useDashboard();
  const money = useMoney();
  const [open, setOpen] = useState<MerchantAction>();
  const [busy, setBusy] = useState<MerchantAction>();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState<number>();
  const [tracking, setTracking] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const start = (action: MerchantAction) => {
    setReason(''); setNotes(detail.inspectionNotes ?? ''); setAmount(undefined); setTracking(''); setFieldErrors({});
    setOpen(action);
  };

  const submit = async () => {
    if (!open) return;
    const errs: Record<string, string> = {};
    if (NEEDS_REASON.includes(open) && !reason.trim()) errs.reason = t('dash.field.required');
    if (open === 'send_revised_offer' && !amount) errs.revisedValueMinor = t('dash.field.required');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(open);
    try {
      const updated = await adminApi.act({
        tradeInId: detail.id, action: open, expectedRevision: detail.revision, idempotencyKey: newKey(),
        reason: reason.trim() || undefined, inspectionNotes: NEEDS_NOTES.includes(open) ? notes.trim() || undefined : undefined,
        revisedValueMinor: open === 'send_revised_offer' ? amount : undefined, trackingNumber: tracking.trim() || undefined,
      });
      onUpdated(updated);
      toast.success(t('dash.action.done', { action: t(`dash.action.${open}`) }));
      setOpen(undefined);
    } catch (err) {
      if (err instanceof AdminApiError && err.fields) {
        const f = err.fields;
        setFieldErrors({
          ...(f.reason ? { reason: t('dash.field.required') } : {}),
          ...(f.revisedValueMinor ? { revisedValueMinor: t(`dash.error.${f.revisedValueMinor as 'too_high'}`) } : {}),
        });
      } else {
        toast.error(errorText(err));
        setOpen(undefined);
        if (err instanceof AdminApiError && (err.code === 'conflict' || err.code === 'invalid_transition')) reload();
      }
    } finally {
      setBusy(undefined);
    }
  };

  const confirmText = (a: MerchantAction) => {
    if (a === 'confirm_value') return t('dash.confirm.confirm_value', { amount: money(detail.estimatedValueMinor, detail.currency) });
    if (a === 'accept_revised_offer') return t('dash.confirm.accept_revised_offer', { amount: money(detail.revisedValueMinor, detail.currency) });
    if (a === 'approve' || a === 'reject' || a === 'send_revised_offer' || a === 'decline_revised_offer' || a === 'cancel') return t(`dash.confirm.${a}`);
    return t('dash.confirm.default');
  };

  return (
    <Card>
      <CardHeader><CardTitle>{t('dash.detail.actions')}</CardTitle></CardHeader>
      <CardContent className="grid gap-2">
        {detail.actions.length === 0 && <p className="text-sm text-muted-foreground">{t('dash.detail.noActions')}</p>}
        {detail.actions.map((a) => (
          <Button key={a} variant={DESTRUCTIVE.includes(a) ? 'outline' : a === detail.actions[0] ? 'default' : 'secondary'} busy={busy === a} disabled={!!busy} onClick={() => start(a)}>
            {t(`dash.action.${a}`)}
          </Button>
        ))}
      </CardContent>
      <AlertDialog open={!!open} onOpenChange={(o) => !o && !busy && setOpen(undefined)}>
        {open && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('dash.confirm.title', { action: t(`dash.action.${open}`) })}</AlertDialogTitle>
              <AlertDialogDescription>{confirmText(open)}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-3">
              {open === 'send_revised_offer' && (
                <Field label={t('dash.field.revisedAmount', { currency: detail.currency })} htmlFor="act-amount" required error={fieldErrors.revisedValueMinor}>
                  <MoneyInput id="act-amount" currency={detail.currency} value={amount} onChange={setAmount} aria-invalid={!!fieldErrors.revisedValueMinor} />
                </Field>
              )}
              {NEEDS_REASON.includes(open) && (
                <Field label={t('dash.field.reason')} htmlFor="act-reason" required error={fieldErrors.reason}>
                  <Textarea id="act-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} aria-invalid={!!fieldErrors.reason} />
                </Field>
              )}
              {NEEDS_NOTES.includes(open) && (
                <Field label={t('dash.field.inspectionNotes')} htmlFor="act-notes">
                  <Textarea id="act-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              )}
              {open === 'mark_in_transit' && (
                <Field label={t('dash.field.trackingNumber')} htmlFor="act-tracking">
                  <Input id="act-tracking" value={tracking} maxLength={80} onChange={(e) => setTracking(e.target.value)} />
                </Field>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel asChild><Button variant="outline" disabled={!!busy}>{t('dash.cancel')}</Button></AlertDialogCancel>
              <Button variant={DESTRUCTIVE.includes(open) ? 'destructive' : 'default'} busy={!!busy} onClick={submit}>{t(`dash.action.${open}`)}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </Card>
  );
}

function NotesCard({ detail, onUpdated }: { detail: AdminTradeInDetail; onUpdated: (d: AdminTradeInDetail) => void }) {
  const { t, locale, errorText } = useDashboard();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      onUpdated(await adminApi.note(detail.id, text.trim()));
      setText('');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dash.detail.notes')}</CardTitle>
        <CardDescription>{t('dash.detail.notesHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {detail.notes.length === 0 ? <p className="text-sm text-muted-foreground">{t('dash.detail.noNotes')}</p> : (
          <ul className="grid gap-2">
            {[...detail.notes].reverse().map((n) => (
              <li key={n.id} className="rounded-md bg-muted p-2 text-sm">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <time className="text-xs text-muted-foreground" dateTime={n.createdAt}>{formatDateTime(n.createdAt, locale)}</time>
              </li>
            ))}
          </ul>
        )}
        <Field label={t('dash.detail.addNote')} htmlFor="note-text">
          <Textarea id="note-text" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button variant="secondary" busy={busy} disabled={!text.trim()} onClick={add}>{t('dash.detail.addNote')}</Button>
      </CardContent>
    </Card>
  );
}
