export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/** Adds browser security headers. WebSocket upgrade responses are returned untouched. */
export function withSecurityHeaders(response: Response): Response {
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('referrer-policy', 'no-referrer');
  out.headers.set('x-frame-options', 'DENY');
  out.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  out.headers.set('cross-origin-opener-policy', 'same-origin');
  const type = out.headers.get('content-type') ?? '';
  if (type.includes('text/html')) out.headers.set('content-security-policy', CSP);
  return out;
}

/**
 * State-changing and socket requests must come from this site (or a configured
 * origin). Browsers always send Origin on WebSocket upgrades and cross-site POSTs;
 * non-browser clients without Origin are allowed because they cannot ride a
 * victim's session (seat tokens are never cookies).
 */
export function isAllowedOrigin(request: Request, extra: string | undefined): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const self = new URL(request.url).origin;
  if (origin === self) return true;
  return (extra ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(origin);
}
