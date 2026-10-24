import { httpClient } from '@wix/essentials';
import type {
  AdminActionRequest,
  AdminListRequest,
  AdminListResponse,
  AdminTradeInDetail,
  OverviewResponse,
} from '../lib/schemas/admin';
import type { Rule, Settings } from '../lib/schemas/domain';

export type NotificationLogEntry = { id: string; tradeInId?: string; eventType: string; recipientType: 'customer' | 'merchant'; status: string; attemptCount: number; lastErrorCode?: string; failures: string[]; createdAt: string; sentAt?: string };
export type DeadJob = { id: string; eventType: string; tradeInId?: string; attempts: number; lastError?: string; updatedAt: string };
import type { OfferResult } from '../lib/offer';
import type { Report } from '../server/services/ReportingService';

// Dashboard → app backend. fetchWithAuth sends the Wix user's identity; every /api/admin route
// re-checks that the caller is a dashboard user of this site.

export class AdminApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly fields?: Record<string, string>) {
    super(code);
  }
}

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; query?: Record<string, unknown>; body?: unknown }): Promise<T> {
  const url = new URL(path, import.meta.url);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v !== undefined && v !== '' && v !== null) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await httpClient.fetchWithAuth(url.href, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AdminApiError('network', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; fields?: Record<string, string> } };
  if (!res.ok) throw new AdminApiError(data.error?.code ?? 'internal', res.status, data.error?.fields);
  return data as T;
}

export const adminApi = {
  overview: () => call<OverviewResponse>('/api/admin/overview'),
  list: (q: Partial<AdminListRequest>) => call<AdminListResponse>('/api/admin/trade-ins', { query: q }),
  detail: (id: string) => call<AdminTradeInDetail>('/api/admin/trade-in', { query: { id } }),
  act: (body: AdminActionRequest) => call<AdminTradeInDetail>('/api/admin/action', { method: 'POST', body }),
  note: (tradeInId: string, text: string) => call<AdminTradeInDetail>('/api/admin/note', { method: 'POST', body: { tradeInId, text } }),
  rules: () => call<Rule[]>('/api/admin/rules'),
  saveRule: (rule: unknown, id?: string) => call<Rule>('/api/admin/rule-save', { method: 'POST', body: { id, rule } }),
  deleteRule: (id: string) => call<{ ok: true }>('/api/admin/rule-delete', { method: 'POST', body: { id } }),
  previewRule: (rule: unknown, priceMinor: number, currency: string, answers: Record<string, string>) =>
    call<{ result: OfferResult; upToMinor: number }>('/api/admin/rule-preview', { method: 'POST', body: { rule, priceMinor, currency, answers } }),
  settings: () => call<Settings>('/api/admin/settings'),
  saveSettings: (settings: Settings) => call<Settings>('/api/admin/settings', { method: 'POST', body: { settings } }),
  notifications: (tradeInId?: string) => call<{ preferences: Settings['notifications']; history: NotificationLogEntry[]; currentUserId: string }>('/api/admin/notifications', { query: { tradeInId } }),
  saveNotifications: (preferences: Settings['notifications']) => call<{ preferences: Settings['notifications'] }>('/api/admin/notifications', { method: 'POST', body: { preferences } }),
  retryCredit: (tradeInId: string) => call<AdminTradeInDetail>('/api/admin/credit-retry', { method: 'POST', body: { tradeInId } }),
  process: () => call<{ done: number; failed: number }>('/api/admin/process', { method: 'POST', body: {} }),
  outbox: () => call<{ giftCardsAvailable: boolean; dead: DeadJob[] }>('/api/admin/outbox'),
  createResale: (tradeInId: string) => call<AdminTradeInDetail>('/api/admin/resale', { method: 'POST', body: { tradeInId } }),
  report: (days: number) => call<Report>('/api/admin/report', { query: { days } }),
  reviveJob: (id: string) => call<{ ok: true }>('/api/admin/outbox', { method: 'POST', body: { id } }),
};

export function newKey(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
