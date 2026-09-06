import type { APIRoute } from 'astro';
import { google, generateState, generateCodeVerifier } from '~/lib/google';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 10,
  };
  cookies.set('g_state', state, cookieOpts);
  cookies.set('g_verifier', codeVerifier, cookieOpts);

  return redirect(url.toString());
};
