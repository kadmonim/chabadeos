import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveTeamRef, resolveEmployeeByEmail } from '~/lib/api-lookup';

// ============================================================
// GET /api/v1/todos
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const assigneeEmail = url.searchParams.get('assignee');
  const teamRef = url.searchParams.get('team_id') ?? url.searchParams.get('team');
  const status = url.searchParams.get('status') ?? 'open';

  let assigneeId: string | null = null;
  if (assigneeEmail) {
    assigneeId = await resolveEmployeeByEmail(assigneeEmail);
    if (!assigneeId) return json({ todos: [], count: 0, note: `no employee with email '${assigneeEmail}'` });
  }

  let teamId: string | null = null;
  if (teamRef) {
    teamId = await resolveTeamRef(teamRef);
    if (!teamId) return json({ todos: [], count: 0, note: `no team matching '${teamRef}'` });
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

  const teamId = await resolveTeamRef(
    body.team_id ? String(body.team_id) : (body.team_name ? String(body.team_name) : null),
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
// body: { id (required), done?, status?, title?, description?, is_urgent?,
//         due_date?, assignee_email?, team_id? | team_name? }
//   - done: toggles status between 'open' and 'done'
//   - assignee_email / due_date / team: pass null or '' to clear
//   - reassigning the team moves the todo and keeps its id and history
// ============================================================
const ALLOWED_TODO_STATUSES = new Set(['open', 'done', 'archived']);

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

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!ALLOWED_TODO_STATUSES.has(status)) {
      return json({ error: `status must be one of ${Array.from(ALLOWED_TODO_STATUSES).join(', ')}` }, 400);
    }
    set('status', status);
  } else if (body.done !== undefined) {
    set('status', Boolean(body.done) ? 'done' : 'open');
  }

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return json({ error: 'title cannot be empty' }, 400);
    set('title', title);
  }
  if (body.description !== undefined) {
    set('description', body.description ? String(body.description) : null);
  }
  if (body.is_urgent !== undefined) {
    set('is_urgent', Boolean(body.is_urgent));
  }
  if (body.due_date !== undefined) {
    set('due_date', body.due_date ? String(body.due_date) : null);
  }
  if (body.assignee_email !== undefined) {
    if (!body.assignee_email) {
      set('assignee_employee_id', null);
    } else {
      const assigneeId = await resolveEmployeeByEmail(String(body.assignee_email));
      if (!assigneeId) return json({ error: `no employee with email '${body.assignee_email}'` }, 400);
      set('assignee_employee_id', assigneeId);
    }
  }
  if (body.team_id !== undefined || body.team_name !== undefined) {
    const raw = body.team_id ?? body.team_name;
    if (!raw) {
      set('team_id', null);
    } else {
      const teamId = await resolveTeamRef(String(raw));
      if (!teamId) return json({ error: `no team matching '${raw}'` }, 400);
      set('team_id', teamId);
    }
  }

  if (sets.length === 0) return json({ error: 'no updatable fields provided' }, 400);

  vals.push(id);
  let result: any;
  try {
    result = await pool.query(
      `update todos set ${sets.join(', ')} where id = $${vals.length} returning id`,
      vals,
    );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (result.rowCount === 0) return json({ error: `no todo with id '${id}'` }, 404);

  return json({ id, ...applied });
};
