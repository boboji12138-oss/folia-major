import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

// Vercel 同源网易云代理；上游仅由服务端配置，登录凭据不进入 URL 或日志。
type ProxyRequest = IncomingMessage & { body?: Record<string, unknown> };

const DEFAULT_UPSTREAM = 'https://api-enhanced-phi-six.vercel.app';
const MAX_BODY_BYTES = 64 * 1024;

async function readBody(req: ProxyRequest): Promise<Record<string, unknown>> {
  if (req.body) return req.body;
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error('Request too large');
  }
  return body ? JSON.parse(body) : {};
}

export default async function handler(req: ProxyRequest, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    send(405, { code: 405, msg: 'Method not allowed' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('path') ?? url.pathname.slice('/api/netease'.length);
  if (!/^\/[a-zA-Z0-9_]+(?:\/[a-zA-Z0-9_]+)*$/.test(path)) {
    send(400, { code: 400, msg: 'Invalid NetEase endpoint' });
    return;
  }

  try {
    const configured = process.env.NETEASE_API_UPSTREAM || process.env.VITE_NETEASE_API_BASE;
    const upstream = new URL(configured?.startsWith('https://') ? configured : DEFAULT_UPSTREAM);
    if (upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('Invalid upstream');
    const target = new URL(upstream.href.replace(/\/$/, '') + path);
    // 旧上游缓存键只看 URL，忽略 POST 正文；每次请求隔离，避免搜索/会话串用。
    target.searchParams.set('_foliaRequest', randomUUID());
    const params: Record<string, unknown> = Object.fromEntries(url.searchParams);
    delete params.path;
    // 服务端 POST 兼容现有 app.all 路由；禁用上游 Set-Cookie 与匿名/登录响应缓存。
    const payload = { ...params, ...(req.method === 'POST' ? await readBody(req) : {}), noCookie: true, timestamp: Date.now() };
    const session = req.headers['x-netease-cookie'];
    if (typeof session === 'string' && session) Object.assign(payload, { cookie: session });
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    const data = await response.json();
    // 不转发上游 Set-Cookie（域名不属于 Folia）；保留原 JSON/code，provider 持有会话。
    send(response.status, data);
  } catch {
    send(502, { code: 502, msg: 'NetEase upstream network request failed', transient: true });
  }
}
