import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDateTime } from '../../lib/i18n';
import { emailAllowed } from '../../lib/plans';
import { NOTIFICATION_EVENTS, type Settings } from '../../lib/schemas/domain';
import { AdminApiError, adminApi, type NotificationLogEntry } from '../api';
import { LoadError, PageHeader } from '../components';
import { useDashboard, useLoad } from '../context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Field, Label } from '../ui/label';
import { Alert, Skeleton } from '../ui/misc';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

type Prefs = Settings['notifications'];

export function NotificationsPage() {
  const { t, errorText, entitlements } = useDashboard();
  const { data, error, loading, reload } = useLoad(() => adminApi.notifications(), []);
  const [prefs, setPrefs] = useState<Prefs>();
  const [saving, setSaving] = useState(false);
  useEffect(() => setPrefs(data?.preferences), [data]);

  if (error) return <LoadError onRetry={reload} />;
  if (loading || !data || !prefs) return <Skeleton className="h-96" />;
  const me = data.currentUserId;
  const isMe = prefs.staffUserIds.includes(me);
  const recipientsFull = prefs.staffUserIds.length >= entitlements.maxStaffRecipients;
  const limitedEmails = entitlements.customerEmails !== 'all' || entitlements.merchantEmails !== 'all';

  const save = async (next: Prefs) => {
    setSaving(true);
    try {
      setPrefs((await adminApi.saveNotifications(next)).preferences);
      toast.success(t('dash.saved'));
    } catch (err) {
      toast.error(err instanceof AdminApiError && err.fields ? t('dash.saveError') : errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const toggles = (kind: 'merchant' | 'customer') => (
    <div className="grid gap-3 sm:grid-cols-2">
      {NOTIFICATION_EVENTS[kind].map((ev) => {
        const id = `n-${kind}-${ev}`;
        const allowed = emailAllowed(entitlements, kind, ev);
        const checked = allowed && (prefs[kind] as Record<string, boolean>)[ev];
        return (
          <div key={ev} className="flex items-center gap-3">
            <Switch id={id} checked={checked} disabled={!allowed} onCheckedChange={(v) => setPrefs({ ...prefs, [kind]: { ...prefs[kind], [ev]: v } })} />
            <Label htmlFor={id}>{t(`dash.notif.event.${ev}`)}</Label>
            {!allowed && <Badge variant="info">{t('dash.plan.proOnly')}</Badge>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title={t('dash.notif.title')} subtitle={t('dash.notif.subtitle')} actions={<Button busy={saving} onClick={() => save(prefs)}>{t('dash.save')}</Button>} />
      <Card>
        <CardHeader>
          <CardTitle>{t('dash.notif.recipients')}</CardTitle>
          <CardDescription>
            {t('dash.notif.recipientsHelp')} · {t('dash.notif.count', { count: prefs.staffUserIds.length })} · {t('dash.plan.recipientLimit', { count: entitlements.maxStaffRecipients })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {prefs.staffUserIds.length === 0 && <Alert variant="warning">{t('dash.notif.noRecipients')}</Alert>}
          <div>
            <Button variant="outline" busy={saving} disabled={!isMe && recipientsFull} onClick={() => save({ ...prefs, staffUserIds: isMe ? prefs.staffUserIds.filter((u) => u !== me) : [...prefs.staffUserIds, me] })}>
              {isMe ? t('dash.notif.removeMe') : t('dash.notif.addMe')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t('dash.notif.sender')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {!entitlements.customSender && <Alert variant="info" className="sm:col-span-2">{t('dash.plan.senderRequiresPro')}</Alert>}
          <Field label={t('dash.notif.senderName')} htmlFor="n-sender"><Input id="n-sender" maxLength={100} disabled={!entitlements.customSender} value={prefs.senderName} onChange={(e) => setPrefs({ ...prefs, senderName: e.target.value })} /></Field>
          <Field label={t('dash.notif.replyTo')} htmlFor="n-reply"><Input id="n-reply" type="email" disabled={!entitlements.customSender} value={prefs.replyToEmail} onChange={(e) => setPrefs({ ...prefs, replyToEmail: e.target.value.trim() })} /></Field>
        </CardContent>
      </Card>
      {limitedEmails && <Alert variant="info">{t('dash.plan.emailsLimited')}</Alert>}
      <Card><CardHeader><CardTitle>{t('dash.notif.merchantEvents')}</CardTitle></CardHeader><CardContent>{toggles('merchant')}</CardContent></Card>
      <Card><CardHeader><CardTitle>{t('dash.notif.customerEvents')}</CardTitle></CardHeader><CardContent>{toggles('customer')}</CardContent></Card>
      <Card>
        <CardHeader><CardTitle>{t('dash.notif.log')}</CardTitle><CardDescription>{t('dash.notif.queuedNote')}</CardDescription></CardHeader>
        <CardContent><DeliveryLog entries={data.history} /></CardContent>
      </Card>
    </div>
  );
}

const STATUSES = ['pending', 'accepted', 'in_progress', 'processed', 'partially_failed', 'rejected', 'failed', 'skipped'] as const;
const isStatus = (s: string): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s);
const EVENTS = [...NOTIFICATION_EVENTS.merchant, ...NOTIFICATION_EVENTS.customer];
const isEvent = (s: string): s is (typeof EVENTS)[number] => (EVENTS as readonly string[]).includes(s);

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'> = {
  processed: 'success', accepted: 'secondary', in_progress: 'secondary', pending: 'outline', skipped: 'outline',
  partially_failed: 'warning', rejected: 'destructive', failed: 'destructive',
};

export function DeliveryLog({ entries }: { entries: NotificationLogEntry[] }) {
  const { t, locale } = useDashboard();
  if (!entries.length) return <p className="text-sm text-muted-foreground">{t('dash.notif.logEmpty')}</p>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>{t('dash.notif.col.event')}</TableHead><TableHead>{t('dash.notif.col.status')}</TableHead>
        <TableHead>{t('dash.notif.col.attempts')}</TableHead><TableHead>{t('dash.notif.col.date')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {entries.map((e) => {
          const [kind, ev] = e.eventType.split('.') as ['customer' | 'merchant', string];
          return (
            <TableRow key={e.id}>
              <TableCell>{t(`dash.actor.${kind === 'customer' ? 'customer' : 'merchant'}`)} · {isEvent(ev) ? t(`dash.notif.event.${ev}`) : ev}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[e.status] ?? 'outline'}>{isStatus(e.status) ? t(`dash.notif.status.${e.status}`) : e.status}</Badge>
                {(e.lastErrorCode || e.failures.length > 0) && <span className="ms-2 text-xs text-muted-foreground">{[e.lastErrorCode, ...e.failures].filter(Boolean).join(', ')}</span>}
              </TableCell>
              <TableCell className="tabular-nums">{e.attemptCount}</TableCell>
              <TableCell className="text-muted-foreground"><time dateTime={e.createdAt}>{formatDateTime(e.createdAt, locale)}</time></TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
