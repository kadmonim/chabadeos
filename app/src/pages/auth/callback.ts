import type { APIRoute } from 'astro';
import { google } from '~/lib/google';
import { sql } from '~/lib/db';
import { createSession } from '~/lib/session';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('g_state')?.value;
  const verifier = cookies.get('g_verifier')?.value;

  if (!code || !state || !storedState || !verifier || state !== storedState) {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  cookies.delete('g_state', { path: '/' });
  cookies.delete('g_verifier', { path: '/' });

  let tokens;
  try {
    tokens = await google.validateAuthorizationCode(code, verifier);
  } catch {
    return new Response('Invalid OAuth code', { status: 400 });
  }

  // Fetch user profile.
  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokens.accessToken()}` },
  });
  if (!profileRes.ok) return new Response('Failed to fetch Google profile', { status: 400 });
  const profile: { email?: string; name?: string; email_verified?: boolean } = await profileRes.json();

  if (!profile.email || !profile.email_verified) {
    return new Response('Email not verified', { status: 403 });
  }

  // Allow-list: must exist in employees table.
  let employee;
  try {
    const rows = await sql`
      select id, full_name, email from employees
      where email ilike ${profile.email}`;
    employee = rows[0] ?? null;
  } catch (e) {
    return new Response(`DB error: ${(e as Error).message}`, { status: 500 });
  }

  if (!employee) {
    return new Response(
      `Access denied: ${profile.email} is not in the employees table. Ask an admin to add you.`,
      { status: 403 },
    );
  }

  await createSession(cookies, {
    email: employee.email,
    employeeId: employee.id,
    fullName: employee.full_name || profile.name || '',
  });

  return redirect('/');
};
