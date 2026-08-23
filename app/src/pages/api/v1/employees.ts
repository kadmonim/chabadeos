import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const email = url.searchParams.get('email');

  let data: any[];
  try {
    data = email
      ? await sql`select id, full_name, email, created_at from employees where email ilike ${email} order by full_name asc`
      : await sql`select id, full_name, email, created_at from employees order by full_name asc`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({
    employees: (data ?? []).map((e) => ({
      id: e.id,
      name: e.full_name,
      email: e.email,
      created_at: e.created_at,
    })),
    count: data?.length ?? 0,
  });
};
