import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ADMIN_SORTS, STATUS_GROUPS, type AdminListRequest } from '../../lib/schemas/admin';
import { formatDate } from '../../lib/i18n';
import { TRADE_IN_STATUSES } from '../../lib/lifecycle';
import { adminApi } from '../api';
import { LoadError, PageHeader, StatusBadge, useMoney } from '../components';
import { useDashboard, useLoad } from '../context';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Input, NativeSelect } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

type Filters = Pick<AdminListRequest, 'q' | 'sort'> & { status?: string; statusGroup?: AdminListRequest['statusGroup']; from?: string; to?: string; page: number };

export function RequestsPage({ initialGroup }: { initialGroup?: AdminListRequest['statusGroup'] }) {
  const { t, go, locale } = useDashboard();
  const money = useMoney();
  const [filters, setFilters] = useState<Filters>({ q: '', sort: 'created_desc', page: 0, statusGroup: initialGroup });
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 })), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const pageSize = 25;
  const { data, error, loading, reload } = useLoad(
    () => adminApi.list({ ...filters, status: filters.status as AdminListRequest['status'], pageSize }),
    [JSON.stringify(filters)],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 0 }));
  const statusValue = filters.status ? `s:${filters.status}` : filters.statusGroup ? `g:${filters.statusGroup}` : '';
  const filtered = useMemo(() => !!(filters.q || filters.status || filters.statusGroup || filters.from || filters.to), [filters]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t('dash.requests.title')} subtitle={t('dash.requests.subtitle')} />
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="req-search">{t('common.search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                <Input id="req-search" type="search" className="ps-8" placeholder={t('dash.requests.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-status">{t('dash.requests.status')}</Label>
              <NativeSelect id="req-status" value={statusValue} onChange={(e) => {
                const v = e.target.value;
                set({ status: v.startsWith('s:') ? v.slice(2) : undefined, statusGroup: v.startsWith('g:') ? (v.slice(2) as Filters['statusGroup']) : undefined });
              }}>
                <option value="">{t('dash.requests.allStatuses')}</option>
                <optgroup label={t('dash.requests.groups')}>
                  {(Object.keys(STATUS_GROUPS) as (keyof typeof STATUS_GROUPS)[]).map((g) => <option key={g} value={`g:${g}`}>{t(`dash.group.${g}`)}</option>)}
                </optgroup>
                <optgroup label={t('dash.requests.status')}>
                  {TRADE_IN_STATUSES.map((s) => <option key={s} value={`s:${s}`}>{t(`status.${s}`)}</option>)}
                </optgroup>
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-from">{t('dash.requests.from')}</Label>
              <Input id="req-from" type="date" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-to">{t('dash.requests.to')}</Label>
              <Input id="req-to" type="date" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-sort">{t('dash.requests.sort')}</Label>
              <NativeSelect id="req-sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
                {ADMIN_SORTS.map((s) => <option key={s} value={s}>{t(`dash.requests.sort.${s}`)}</option>)}
              </NativeSelect>
            </div>
          </div>
          {filtered && <div><Button variant="link" size="sm" className="px-0" onClick={() => { setSearch(''); setFilters({ q: '', sort: filters.sort, page: 0 }); }}>{t('dash.requests.clear')}</Button></div>}

          {error ? <LoadError onRetry={reload} /> : (
            <Table aria-busy={loading}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dash.requests.col.reference')}</TableHead>
                  <TableHead>{t('dash.requests.col.customer')}</TableHead>
                  <TableHead>{t('dash.requests.col.product')}</TableHead>
                  <TableHead>{t('dash.requests.col.category')}</TableHead>
                  <TableHead className="text-end">{t('dash.requests.col.offer')}</TableHead>
                  <TableHead>{t('dash.requests.col.status')}</TableHead>
                  <TableHead>{t('dash.requests.col.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data
                  ? Array.from({ length: 5 }, (_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-5" /></TableCell></TableRow>)
                  : data?.items.length
                    ? data.items.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => go(`/requests/${r.id}`)}>
                          <TableCell>
                            <Button variant="link" className="h-auto px-0 font-mono" aria-label={t('dash.requests.open', { reference: r.reference })} onClick={(e) => { e.stopPropagation(); go(`/requests/${r.id}`); }}>{r.reference}</Button>
                          </TableCell>
                          <TableCell><div className="grid"><span>{r.customerName}</span><span className="text-xs text-muted-foreground">{r.customerEmail}</span></div></TableCell>
                          <TableCell className="max-w-56">
                            <div className="grid">
                              <span className="truncate">{r.productTitle}</span>
                              {r.custom && <Badge variant="outline" className="w-fit">{t('dash.requests.custom')}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.categoryId ? `${r.categoryId.slice(0, 8)}…` : '—'}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            {r.custom && !r.estimatedValueMinor && r.finalValueMinor === undefined
                              ? <span className="text-muted-foreground">{t('dash.requests.needsQuote')}</span>
                              : money(r.finalValueMinor ?? r.estimatedValueMinor, r.currency)}
                          </TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-muted-foreground"><time dateTime={r.createdAt}>{formatDate(r.createdAt, locale)}</time></TableCell>
                        </TableRow>
                      ))
                    : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{filtered ? t('dash.requests.empty') : t('dash.requests.emptyAll')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
          {data && data.total > 0 && (
            <nav className="flex items-center justify-between gap-2 text-sm" aria-label={t('dash.requests.page', { page: filters.page + 1, pages, total: data.total })}>
              <span className="text-muted-foreground">{t('dash.requests.page', { page: filters.page + 1, pages, total: data.total })}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" aria-label={t('dash.requests.prev')} disabled={filters.page === 0} onClick={() => set({ page: filters.page - 1 })}><ChevronLeft className="rtl:rotate-180" /></Button>
                <Button variant="outline" size="icon" aria-label={t('dash.requests.next')} disabled={filters.page + 1 >= pages} onClick={() => set({ page: filters.page + 1 })}><ChevronRight className="rtl:rotate-180" /></Button>
              </div>
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
