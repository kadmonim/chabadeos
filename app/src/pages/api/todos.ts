import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { canAccessTeam } from '~/lib/team';

async function assertTodoTeamAccess(id: string, locals: App.Locals) {
  const { data } = await supabase.from('todos').select('team_id').eq('id', id).maybeSingle();
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
    if (!title) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const due_date = due.toISOString().slice(0, 10);
    const { error } = await supabase.from('todos').insert({
      title, team_id, assignee_employee_id, status: 'open', due_date,
    });
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertTodoTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const new_team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, new_team_id)) return new Response('Forbidden', { status: 403 });
    const patch: any = {
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '') || null,
      team_id: new_team_id,
      assignee_employee_id: String(form.get('assignee_employee_id') ?? '') || null,
      due_date: String(form.get('due_date') ?? '') || null,
      is_urgent: form.get('is_urgent') === 'on',
    };
    const status = form.get('status');
    if (status) patch.status = String(status);
    const { error } = await supabase.from('todos').update(patch).eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'archive_done') {
    const team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    let q = supabase.from('todos').update({ status: 'archived' }).eq('status', 'done');
    if (team_id) q = q.eq('team_id', team_id);
    const { error } = await q;
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertTodoTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
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
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (TODO_PATCH_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return new Response('no valid fields', { status: 400 });
  const { error } = await supabase.from('todos').update(patch).eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
