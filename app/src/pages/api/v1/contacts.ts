import type { APIRoute } from 'astro';
import { pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const q = url.searchParams.get('q');
  const category = url.searchParams.get('category');
  const employeeId = url.searchParams.get('employee_id');

  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (q) {
    vals.push(`%${q}%`);
    wheres.push(`(name ilike $${vals.length} or nicknames ilike $${vals.length} or private_email ilike $${vals.length})`);
  }
  if (category) {
    vals.push(category);
    wheres.push(`category = $${vals.length}`);
  }
  if (employeeId) {
    vals.push(employeeId);
    wheres.push(`employee_id = $${vals.length}`);
  }

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        id, name, category, real_first_name, nicknames,
        private_cell_number, anonymous_number, whatsapp_number,
        private_email, anonymous_email, location, about, is_private,
        employee_id, created_at, updated_at
      from contacts
      ${wheres.length ? `where ${wheres.join(' and ')}` : ''}
      order by name asc`,
      vals,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({
    contacts: data ?? [],
    count: data?.length ?? 0,
  });
};
