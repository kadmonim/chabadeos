import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

const ROCK_STATUSES = new Set(['on_track', 'off_track', 'done']);

async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const rows = await sql`select id from employees where email ilike ${email}`;
  return (rows[0] as any)?.id ?? null;
}

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const includeArchived = url.searchParams.get('include_archived') === '1';

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        r.id, r.title, r.description, r.status, r.due_date, r.priority_order, r.is_archived, r.created_at,
        case when o.id is null then null
             else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner
      from rocks r
      left join employees o on o.id = r.owner_employee_id
      ${includeArchived ? '' : 'where r.is_archived = false'}
      order by r.priority_order asc`,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const rocks = (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    due_date: r.due_date,
    priority_order: r.priority_order,
    is_archived: r.is_archived,
    created_at: r.created_at,
    owner: r.owner ? { id: r.owner.id, name: r.owner.full_name, email: r.owner.email } : null,
  }));

  return json({ rocks, count: rocks.length });
};

// ============================================================
// POST /api/v1/rocks — create a rock (project)
// body: { title (required), description?, owner_email?, due_date? (YYYY-MM-DD),
//         status? (on_track|off_track|done), priority_order? }
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return json({ error: 'title is required' }, 400);

  const status = body.status ? String(body.status) : 'on_track';
  if (!ROCK_STATUSES.has(status)) {
    return json({ error: `status must be one of: ${[...ROCK_STATUSES].join(', ')}` }, 400);
  }

  const ownerId = body.owner_email ? await resolveEmployeeByEmail(String(body.owner_email)) : null;
  if (body.owner_email && !ownerId) {
    return json({ error: `no employee with email '${body.owner_email}'` }, 400);
  }

  let data: any;
  try {
    const rows = await sql`
      insert into rocks (title, description, owner_employee_id, due_date, status, priority_order)
      values (${title}, ${body.description ? String(body.description) : null}, ${ownerId},
              ${body.due_date ? String(body.due_date) : null}, ${status},
              ${Number.isInteger(body.priority_order) ? body.priority_order : 0})
      returning id`;
    data = rows[0];
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: data.id }, 201);
};

// ============================================================
// PATCH /api/v1/rocks — update a rock
// body: { id (required), title?, description?, owner_email?, due_date?,
//         status?, priority_order?, is_archived? }
//   - owner_email / due_date / description: pass null or '' to clear
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const id = body?.id ? String(body.id) : '';
  if (!id) return json({ error: 'id is required' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const applied: Record<string, unknown> = {};
  const set = (col: string, value: unknown) => {
    vals.push(value);
    sets.push(`${col} = $${vals.length}`);
    applied[col] = value;
  };

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return json({ error: 'title cannot be empty' }, 400);
    set('title', title);
  }
  if (body.description !== undefined) {
    set('description', body.description ? String(body.description) : null);
  }
  if (body.due_date !== undefined) {
    set('due_date', body.due_date ? String(body.due_date) : null);
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!ROCK_STATUSES.has(status)) {
      return json({ error: `status must be one of: ${[...ROCK_STATUSES].join(', ')}` }, 400);
    }
    set('status', status);
  }
  if (body.priority_order !== undefined) {
    if (!Number.isInteger(body.priority_order)) {
      return json({ error: 'priority_order must be an integer' }, 400);
    }
    set('priority_order', body.priority_order);
  }
  if (body.is_archived !== undefined) {
    set('is_archived', Boolean(body.is_archived));
  }
  if (body.owner_email !== undefined) {
    if (!body.owner_email) {
      set('owner_employee_id', null);
    } else {
      const ownerId = await resolveEmployeeByEmail(String(body.owner_email));
      if (!ownerId) return json({ error: `no employee with email '${body.owner_email}'` }, 400);
      set('owner_employee_id', ownerId);
    }
  }

  if (sets.length === 0) return json({ error: 'no updatable fields provided' }, 400);

  vals.push(id);
  let result: any;
  try {
    result = await pool.query(
      `update rocks set ${sets.join(', ')} where id = $${vals.length} returning id`,
      vals,
    );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (result.rowCount === 0) return json({ error: `no rock with id '${id}'` }, 404);

  return json({ id, ...applied });
};
