import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

async function assertTodoTeamAccess(id: string, locals: App.Locals) {
  const rows = await sql`select team_id from todos where id = ${id}`;
  const data = rows[0] ?? null;
  return canAccessTeam(locals, data?.team_id);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/todos');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const team_id = String(form.get('team_id') ?? '') || null;
    const assignee_employee_id = String(form.get('assignee_employee_id') ?? '') || null;
    const description = String(form.get('description') ?? '') || null;
    const is_urgent = form.get('is_urgent') === 'on' || form.get('is_urgent') === 'true';
    let due_date = String(form.get('due_date') ?? '') || null;
    if (!due_date) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      due_date = due.toISOString().slice(0, 10);
    }
    if (!title) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        insert into todos (title, team_id, assignee_employee_id, status, description, due_date, is_urgent)
        values (${title}, ${team_id}, ${assignee_employee_id}, ${'open'}, ${description}, ${due_date}, ${is_urgent})`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertTodoTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const new_team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, new_team_id)) return new Response('Forbidden', { status: 403 });
    const vals: unknown[] = [
      String(form.get('title') ?? '').trim(),
      String(form.get('description') ?? '') || null,
      new_team_id,
      String(form.get('assignee_employee_id') ?? '') || null,
      String(form.get('due_date') ?? '') || null,
      form.get('is_urgent') === 'on',
    ];
    let setClause = 'title = $1, description = $2, team_id = $3, assignee_employee_id = $4, due_date = $5, is_urgent = $6';
    const status = form.get('status');
    if (status) {
      vals.push(String(status));
      setClause += `, status = $${vals.length}`;
    }
    vals.push(id);
    try {
      await pool.query(`update todos set ${setClause} where id = $${vals.length}`, vals);
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'archive_done') {
    const team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    try {
      if (team_id) {
        await sql`update todos set status = ${'archived'} where status = ${'done'} and team_id = ${team_id}`;
      } else {
        await sql`update todos set status = ${'archived'} where status = ${'done'}`;
      }
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertTodoTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from todos where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

// PATCH accepts a partial update; only whitelisted fields are applied.
const TODO_PATCH_FIELDS = new Set(['status', 'description', 'title', 'is_urgent', 'due_date']);

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  if (!(await assertTodoTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (TODO_PATCH_FIELDS.has(k)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return new Response('no valid fields', { status: 400 });
  vals.push(id);
  try {
    await pool.query(`update todos set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
