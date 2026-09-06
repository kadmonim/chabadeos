// Signed session cookies via JWT (HMAC-SHA256).
// The cookie is the only source of truth for "who is logged in".

import { SignJWT, jwtVerify } from 'jose';
import type { AstroCookies } from 'astro';

const COOKIE_NAME = 'chabad_session';
const MAX_AGE_DAYS = 30;

const secret = () => new TextEncoder().encode(import.meta.env.SESSION_SECRET);

export type SessionPayload = {
  email: string;
  employeeId: string;
  fullName: string;
};

export async function createSession(cookies: AstroCookies, payload: SessionPayload) {
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(secret());

  cookies.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * MAX_AGE_DAYS,
  });
}

export async function readSession(cookies: AstroCookies): Promise<SessionPayload | null> {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.email !== 'string' || typeof payload.employeeId !== 'string') return null;
    return {
      email: payload.email,
      employeeId: payload.employeeId,
      fullName: typeof payload.fullName === 'string' ? payload.fullName : '',
    };
  } catch {
    return null;
  }
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
