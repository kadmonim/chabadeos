import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

// ---------- helpers ----------
async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const { data } = await supabase.from('employees').select('id').ilike('email', email).maybeSingle();
  return data?.id ?? null;
}
async function resolveTeam(teamId: string | null, teamName: string | null): Promise<string | null> {
  if (teamId) return teamId;
  if (!teamName) return null;
  const { data } = await supabase.from('teams').select('id').ilike('name', teamName).maybeSingle();
  return data?.id ?? null;
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

  let q = supabase
    .from('todos')
    .select(`
      id, title, description, status, is_urgent, due_date, created_at, updated_at,
      team:teams(id, name),
      assignee:employees!todos_assignee_employee_id_fkey(id, full_name, email)
    `)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (assigneeId) q = q.eq('assignee_employee_id', assigneeId);
  if (teamId) q = q.eq('team_id', teamId);
  if (status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

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

  const { data, error } = await supabase
    .from('todos')
    .insert({
      title,
      description: body.description ? String(body.description) : null,
      assignee_employee_id: assigneeId,
      team_id: teamId,
      due_date: body.due_date ? String(body.due_date) : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })(),
      is_urgent: body.is_urgent === true,
      status: 'open',
    })
    .select('id')
    .single();
  if (error) return json({ error: error.message }, 500);

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

  const { error } = await supabase.from('todos').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ id, ...patch });
};
