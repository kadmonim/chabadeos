import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

// ---------- helpers ----------
async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const rows = await sql`select id from employees where email ilike ${email}`;
  return (rows[0] as any)?.id ?? null;
}
async function resolveTeam(teamId: string | null, teamName: string | null): Promise<string | null> {
  if (teamId) return teamId;
  if (!teamName) return null;
  const rows = await sql`select id from teams where name ilike ${teamName}`;
  return (rows[0] as any)?.id ?? null;
}

// ============================================================
// GET /api/v1/todos
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const assigneeEmail = url.searchParams.get('assignee');
  const teamId = url.searchParams.get('team_id');
  const status = url.searchParams.get('status') ?? 'open';

  let assigneeId: string | null = null;
  if (assigneeEmail) {
    assigneeId = await resolveEmployeeByEmail(assigneeEmail);
    if (!assigneeId) return json({ todos: [], count: 0, note: `no employee with email '${assigneeEmail}'` });
  }

  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (assigneeId) {
    vals.push(assigneeId);
    wheres.push(`td.assignee_employee_id = $${vals.length}`);
  }
  if (teamId) {
    vals.push(teamId);
    wheres.push(`td.team_id = $${vals.length}`);
  }
  if (status !== 'all') {
    vals.push(status);
    wheres.push(`td.status = $${vals.length}`);
  }

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        td.id, td.title, td.description, td.status, td.is_urgent, td.due_date, td.created_at, td.updated_at,
        case when t.id is null then null
             else json_build_object('id', t.id, 'name', t.name) end as team,
        case when a.id is null then null
             else json_build_object('id', a.id, 'full_name', a.full_name, 'email', a.email) end as assignee
      from todos td
      left join teams t on t.id = td.team_id
      left join employees a on a.id = td.assignee_employee_id
      ${wheres.length ? `where ${wheres.join(' and ')}` : ''}
      order by td.due_date asc nulls last`,
      vals,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const todos = (data ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    is_urgent: t.is_urgent,
    due_date: t.due_date,
    created_at: t.created_at,
    updated_at: t.updated_at,
    team: t.team ? { id: t.team.id, name: t.team.name } : null,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.full_name, email: t.assignee.email } : null,
  }));

  return json({ todos, count: todos.length });
};

// ============================================================
// POST /api/v1/todos — create a new todo
// body: { title (required), description?, assignee_email?, team_id? or team_name?,
//         due_date? (YYYY-MM-DD), is_urgent? (bool) }
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return json({ error: 'title is required' }, 400);

  const assigneeId = body.assignee_email
    ? await resolveEmployeeByEmail(String(body.assignee_email))
    : null;
  if (body.assignee_email && !assigneeId) {
    return json({ error: `no employee with email '${body.assignee_email}'` }, 400);
  }

  const teamId = await resolveTeam(
    body.team_id ? String(body.team_id) : null,
    body.team_name ? String(body.team_name) : null,
  );
  if ((body.team_id || body.team_name) && !teamId) {
    return json({ error: 'team not found' }, 400);
  }

  const dueDate = body.due_date ? String(body.due_date) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  let data: any;
  try {
    const rows = await sql`
      insert into todos (title, description, assignee_employee_id, team_id, due_date, is_urgent, status)
      values (${title}, ${body.description ? String(body.description) : null}, ${assigneeId}, ${teamId},
              ${dueDate}, ${body.is_urgent === true}, ${'open'})
      returning id`;
    data = rows[0];
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: data.id }, 201);
};

// ============================================================
// PATCH /api/v1/todos — update a todo
// body: { id (required), done?, is_urgent?, due_date?, assignee_email? }
//   - done: toggles status between 'open' and 'done'
//   - assignee_email: pass null/empty string to unassign
//   - due_date: YYYY-MM-DD, or null/empty string to clear
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const id = body?.id ? String(body.id) : '';
  if (!id) return json({ error: 'id is required' }, 400);

  const patch: Record<string, unknown> = {};

  if (body.done !== undefined) {
    patch.status = Boolean(body.done) ? 'done' : 'open';
  }
  if (body.is_urgent !== undefined) {
    patch.is_urgent = Boolean(body.is_urgent);
  }
  if (body.due_date !== undefined) {
    patch.due_date = body.due_date ? String(body.due_date) : null;
  }
  if (body.assignee_email !== undefined) {
    if (!body.assignee_email) {
      patch.assignee_employee_id = null;
    } else {
      const assigneeId = await resolveEmployeeByEmail(String(body.assignee_email));
      if (!assigneeId) return json({ error: `no employee with email '${body.assignee_email}'` }, 400);
      patch.assignee_employee_id = assigneeId;
    }
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: 'no updatable fields provided' }, 400);
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.status !== undefined) { vals.push(patch.status); sets.push(`status = $${vals.length}`); }
  if (patch.is_urgent !== undefined) { vals.push(patch.is_urgent); sets.push(`is_urgent = $${vals.length}`); }
  if ('due_date' in patch) { vals.push(patch.due_date); sets.push(`due_date = $${vals.length}`); }
  if ('assignee_employee_id' in patch) { vals.push(patch.assignee_employee_id); sets.push(`assignee_employee_id = $${vals.length}`); }
  vals.push(id);

  try {
    await pool.query(`update todos set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  return json({ id, ...patch });
};
