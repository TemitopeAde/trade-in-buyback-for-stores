import { httpClient } from '@wix/essentials';
import type {
  CatalogItem,
  CatalogSearchResponse,
  CustomerTradeInView,
  EstimateResponse,
  FormConfig,
  MediaStatus,
  MyTradeInsResponse,
  ProductCtaResponse,
  SubmitRequest,
  SubmitResponse,
  UploadTarget,
} from '../../../lib/schemas/api';
import type { ConditionAnswers } from '../../../lib/schemas/domain';

// Widget → app backend client. fetchWithAuth attaches the visitor/member identity, which the
// server verifies; the browser never sends instance, member or price data.

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
    this.name = 'ApiClientError';
  }
}

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; query?: Record<string, string | number | undefined>; body?: unknown }): Promise<T> {
  const url = new URL(path, import.meta.url);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await httpClient.fetchWithAuth(url.href, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiClientError('network', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; fields?: Record<string, string> } };
  if (!res.ok) throw new ApiClientError(data.error?.code ?? 'internal', res.status, data.error?.fields);
  return data as T;
}

export const widgetApi = {
  searchCatalog: (q: string, cursor?: string) =>
    call<CatalogSearchResponse>('/api/catalog/search', { query: { q, ...(cursor ? { cursor } : {}) } }),
  orderItems: () => call<CatalogItem[]>('/api/catalog/order-items'),
  productCta: (productId: string) => call<ProductCtaResponse>('/api/catalog/product-cta', { query: { productId } }),
  formConfig: (productId: string) => call<FormConfig>('/api/trade-ins/form-config', { query: { productId } }),
  customItemConfig: () => call<FormConfig>('/api/trade-ins/custom-item-config'),
  estimate: (productId: string, answers: ConditionAnswers) => call<EstimateResponse>('/api/trade-ins/estimate', { method: 'POST', body: { productId, answers } }),
  uploadUrl: (body: { uploadSessionId?: string; kind: 'photo' | 'video'; mimeType: string; fileName: string; sizeBytes: number; durationSeconds?: number }) =>
    call<UploadTarget>('/api/media/upload-url', { method: 'POST', body }),
  confirmUpload: (body: { uploadSessionId: string; mediaId: string; fileId: string }) => call<MediaStatus>('/api/media/confirm', { method: 'POST', body }),
  mediaStatus: (uploadSessionId: string) => call<MediaStatus[]>('/api/media/status', { query: { uploadSessionId } }),
  submit: (body: SubmitRequest) => call<SubmitResponse>('/api/trade-ins/create', { method: 'POST', body }),
  status: (ref: { token?: string; tradeInId?: string }) => call<CustomerTradeInView>('/api/trade-ins/status', { method: 'POST', body: ref }),
  customerAction: (body: { token?: string; tradeInId?: string; action: string; expectedRevision: number; trackingNumber?: string; idempotencyKey: string }) =>
    call<CustomerTradeInView>('/api/trade-ins/customer-action', { method: 'POST', body }),
  mine: (cursor = 0) => call<MyTradeInsResponse>('/api/trade-ins/mine', { query: { cursor } }),
};

/** Maps an API error to a catalog message key so every failure renders localized text. */
export function errorMessageKey(err: unknown) {
  const code = err instanceof ApiClientError ? err.code : 'internal';
  switch (code) {
    case 'network': return 'error.network' as const;
    case 'not_found': return 'error.notFound' as const;
    case 'expired': return 'error.expiredLink' as const;
    case 'rate_limited': return 'error.rateLimited' as const;
    case 'conflict': case 'invalid_transition': return 'error.conflict' as const;
    default: return 'error.generic' as const;
  }
}
