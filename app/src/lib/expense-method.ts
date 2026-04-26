// Cookie-backed method filter shared across the expense pages.

import type { AstroCookies } from 'astro';

export const METHOD_COOKIE = 'chabad_expense_method';

/**
 * Resolve the method filter for the current request:
 *   - ?method=<name> → set cookie and use it
 *   - ?method=all    → clear cookie and use no filter
 *   - no query param → fall back to whatever is in the cookie
 */
export function resolveMethodFilter(url: URL, cookies: AstroCookies): string | null {
  const queryMethod = url.searchParams.get('method');
  if (queryMethod !== null) {
    if (queryMethod === '' || queryMethod === 'all') {
      cookies.delete(METHOD_COOKIE, { path: '/' });
      return null;
    }
    cookies.set(METHOD_COOKIE, queryMethod, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
    return queryMethod;
  }
  return cookies.get(METHOD_COOKIE)?.value || null;
}
