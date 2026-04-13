import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { canAccessTeam } from '~/lib/team';

async function assertIssueTeamAccess(id: string, locals: App.Locals) {
  const { data } = await supabase.from('issues').select('team_id').eq('id', id).maybeSingle();
  return canAccessTeam(locals, data?.team_id);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/issues');

  if (action === 'archive_solved') {
    const team_id = String(form.get('team_id') ?? '') || null;
    const term_type = String(form.get('term_type') ?? '') || null;
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    let q = supabase.from('issues').update({ status: 'archived' }).eq('status', 'solved');
    if (team_id) q = q.eq('team_id', team_id);
    if (term_type) q = q.eq('term_type', term_type);
    const { error } = await q;
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const team_id = String(form.get('team_id') ?? '') || null;
    const term_type = (String(form.get('term_type') ?? 'short_term')) as 'short_term' | 'long_term';
    const owner_employee_id = String(form.get('owner_employee_id') ?? '') || null;
    const description = String(form.get('description') ?? '') || null;
    const priorityRaw = form.get('priority');
    const priority = priorityRaw ? Number(priorityRaw) : 3;
    if (!title) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    const { error } = await supabase.from('issues').insert({
      title, team_id, term_type, owner_employee_id, status: 'open',
      priority, description,
    });
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const new_team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, new_team_id)) return new Response('Forbidden', { status: 403 });
    const patch: any = {
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '') || null,
      team_id: new_team_id,
      owner_employee_id: String(form.get('owner_employee_id') ?? '') || null,
      priority: Number(form.get('priority') ?? 3),
      term_type: String(form.get('term_type') ?? 'short_term'),
    };
    const status = form.get('status');
    if (status) patch.status = String(status);
    const { error } = await supabase.from('issues').update(patch).eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

// PUT /api/issues — reorder issues
// body: { ids: string[] } — ordered list of issue IDs
export const PUT: APIRoute = async ({ request, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return new Response('body must be JSON', { status: 400 }); }
  const ids: string[] = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return new Response('ids required', { status: 400 });

  const updates = ids.map((id, i) =>
    supabase.from('issues').update({ priority_order: i }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const err = results.find((r) => r.error);
  if (err?.error) return new Response(err.error.message, { status: 500 });
  return new Response(null, { status: 204 });
};

const ISSUE_PATCH_FIELDS = new Set(['status', 'description', 'title', 'priority', 'term_type']);

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (ISSUE_PATCH_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return new Response('no valid fields', { status: 400 });
  const { error } = await supabase.from('issues').update(patch).eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
