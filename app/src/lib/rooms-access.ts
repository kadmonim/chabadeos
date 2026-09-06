// Code-based access to the /rooms booking screen.
//
// The screen is meant for the wider community, not just EOS users, so instead
// of a Google login it asks for a shared code (see the rooms-access-code
// migration). Entering it once sets a long-lived signed cookie. The current
// code is embedded in the cookie and re-checked against the database on every
// request, so rotating the code in app_settings locks everyone out at once.

import { SignJWT, jwtVerify } from 'jose';
import type { AstroCookies } from 'astro';
import { sql } from './db';

const COOKIE_NAME = 'rooms_access';
const MAX_AGE_DAYS = 180;

const secret = () => new TextEncoder().encode(import.meta.env.SESSION_SECRET);

export async function currentRoomsCode(): Promise<string | null> {
  const rows = await sql`select value from app_settings where key = 'rooms_access_code'`;
  return (rows[0] as any)?.value ?? null;
}

export async function grantRoomsAccess(cookies: AstroCookies, code: string): Promise<void> {
  const jwt = await new SignJWT({ code })
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

export async function hasRoomsAccess(cookies: AstroCookies): Promise<boolean> {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.code !== 'string') return false;
    const code = await currentRoomsCode();
    return !!code && payload.code === code;
  } catch {
    return false;
  }
}
