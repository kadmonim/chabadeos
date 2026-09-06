import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';

// Rocks have no team_id in the schema — they're org-wide. Authentication alone
// (via middleware) gates access.

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/rocks');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    if (!title) return redirect(back);
    try {
      await sql`
        insert into rocks (title, description, owner_employee_id, due_date, status, priority_order)
        values (
          ${title},
          ${String(form.get('description') ?? '') || null},
          ${String(form.get('owner_employee_id') ?? '') || null},
          ${String(form.get('due_date') ?? '') || null},
          ${String(form.get('status') ?? 'on_track')},
          ${Number(form.get('priority_order') ?? 0)}
        )`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    try {
      await sql`
        update rocks set
          title = ${String(form.get('title') ?? '').trim()},
          description = ${String(form.get('description') ?? '') || null},
          owner_employee_id = ${String(form.get('owner_employee_id') ?? '') || null},
          due_date = ${String(form.get('due_date') ?? '') || null},
          status = ${String(form.get('status') ?? 'on_track')}
        where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    try {
      await sql`delete from rocks where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

const ROCK_PATCH_FIELDS = new Set(['status', 'description', 'title', 'due_date', 'owner_employee_id']);

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (ROCK_PATCH_FIELDS.has(k)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return new Response('no valid fields', { status: 400 });
  vals.push(id);
  try {
    await pool.query(`update rocks set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
