import type { APIRoute } from 'astro';
import { clearSession } from '~/lib/session';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/login');
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/login');
};
