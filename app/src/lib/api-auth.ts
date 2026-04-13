// Shared auth helper for the /api/v1/* machine API.
// Callers pass `Authorization: Bearer <key>`; valid keys come from the
// comma-separated API_KEYS env var.

export function requireApiKey(request: Request): Response | null {
  const raw = import.meta.env.API_KEYS || '';
  const keys = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  if (keys.size === 0) {
    return json({ error: 'API_KEYS env var not configured' }, 500);
  }
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !keys.has(match[1])) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2) + '\n', {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
