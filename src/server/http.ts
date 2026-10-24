import type { APIContext, APIRoute } from 'astro';
import type { z } from 'zod';
import { isInstanceDisconnected } from './container';
import { getRequestContext, type RequestContext } from './context';
import { AppError, isAppError, sanitizeErrorForLog } from './errors';

// Thin route wrapper so every endpoint does the same things in the same order:
// verified identity → disconnect check → rate limit → Zod validation → handler → sanitized response.

type Handler<S extends z.ZodType, R> = (ctx: RequestContext, input: z.infer<S>, api: APIContext) => Promise<R>;

type Options = {
  /** Requests per minute per (instance, caller, route). Best-effort, per server process. */
  rateLimitPerMinute?: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, perMinute: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  if (++b.count > perMinute) throw new AppError('rate_limited');
}

async function readInput(api: APIContext): Promise<unknown> {
  if (api.request.method === 'GET') return Object.fromEntries(new URL(api.request.url).searchParams);
  const text = await api.request.text();
  if (text.length > 100_000) throw new AppError('bad_request', 'body too large');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('bad_request', 'invalid json');
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(err: unknown, route: string): Response {
  if (isAppError(err)) {
    if (err.status >= 500) console.error(`[trade-in] ${route}`, err.code, err.detail);
    return json({ error: { code: err.code, ...(err.fields ? { fields: err.fields } : {}) } }, err.status);
  }
  const zodIssues = (err as { issues?: { path: PropertyKey[]; message: string }[] })?.issues;
  if (Array.isArray(zodIssues)) {
    return json({ error: { code: 'bad_request', fields: Object.fromEntries(zodIssues.slice(0, 20).map((i) => [i.path.map(String).join('.') || '_', i.message])) } }, 400);
  }
  console.error(`[trade-in] ${route}`, sanitizeErrorForLog(err));
  return json({ error: { code: 'internal' } }, 500);
}

export function route<S extends z.ZodType, R>(schema: S, handler: Handler<S, R>, opts: Options = {}): APIRoute {
  return async (api) => {
    const path = new URL(api.request.url).pathname;
    try {
      const ctx = await getRequestContext();
      if (await isInstanceDisconnected(ctx.instanceId)) throw new AppError('unavailable', 'app disconnected');
      if (opts.rateLimitPerMinute) rateLimit(`${ctx.instanceId}:${ctx.caller.id}:${path}`, opts.rateLimitPerMinute);
      const input = schema.parse(await readInput(api));
      return json(await handler(ctx, input, api));
    } catch (err) {
      return errorResponse(err, path);
    }
  };
}
