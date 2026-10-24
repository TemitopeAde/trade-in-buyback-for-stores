// Sanitized application errors. `code` is stable and safe to return to clients; `detail`
// is for server logs only and never leaves the backend.

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid_transition'
  | 'expired'
  | 'rate_limited'
  | 'unavailable'
  | 'precondition_failed'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_transition: 409,
  expired: 410,
  rate_limited: 429,
  unavailable: 503,
  precondition_failed: 412,
  internal: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(detail ?? code);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Strips anything that might carry PII or secrets before an error is persisted or logged. */
export function sanitizeErrorForLog(err: unknown): { code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown; details?: { applicationError?: { code?: unknown } } };
  const code = String(e?.details?.applicationError?.code ?? e?.code ?? 'unknown').slice(0, 80);
  const message = String(e?.message ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[A-Z0-9]{8,20}\b/g, '[redacted]')
    .slice(0, 300);
  return { code, message };
}
