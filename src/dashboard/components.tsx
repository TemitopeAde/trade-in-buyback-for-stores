import React, { useId, type ReactNode } from 'react';
import type { TradeInStatus } from '../lib/lifecycle';
import { currencyExponent, formatMoney, toMinor } from '../lib/money';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert } from './ui/misc';
import { Input } from './ui/input';
import { useDashboard } from './context';

const STATUS_VARIANT: Record<TradeInStatus, 'secondary' | 'info' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  submitted: 'info', under_review: 'info', quote_pending: 'warning', approved: 'secondary', in_transit: 'secondary', received: 'secondary', inspection: 'warning',
  revised_offer_pending: 'warning', revised_offer_accepted: 'success', revised_offer_declined: 'outline', credit_pending: 'warning',
  credit_issued: 'success', return_pending: 'outline', closed: 'outline', cancelled: 'outline', rejected: 'destructive',
};

export function StatusBadge({ status }: { status: TradeInStatus }) {
  const { t } = useDashboard();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useDashboard();
  return (
    <Alert variant="destructive" title={t('dash.loadError')}>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>{t('dash.retry')}</Button>
    </Alert>
  );
}

export function useMoney() {
  const { locale } = useDashboard();
  return (minor: number | undefined, currency: string) => (minor === undefined ? '—' : formatMoney(minor, currency, locale));
}

export function minorToInput(minor: number | undefined, currency: string): string {
  if (minor === undefined) return '';
  const exp = currencyExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

export function inputToMinor(value: string, currency: string): number | undefined {
  const v = value.trim().replace(',', '.');
  if (!v) return undefined;
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  return toMinor(v, currency);
}

/** Money entered in major units; converted with the currency's real exponent (JPY 0, KWD 3). */
export function MoneyInput({ value, currency, onChange, ...rest }: { value: number | undefined; currency: string; onChange: (minor: number | undefined) => void } & Omit<React.ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [text, setText] = React.useState(minorToInput(value, currency));
  React.useEffect(() => setText(minorToInput(value, currency)), [value, currency]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const minor = inputToMinor(e.target.value, currency);
        if (minor === undefined || !Number.isNaN(minor)) onChange(minor);
      }}
    />
  );
}

export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}
