import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { canAccessTeam } from '~/lib/team';
import { isSystemAdmin } from '~/lib/permissions';

async function assertMembershipAccess(id: string, locals: App.Locals) {
  const { data } = await supabase.from('team_memberships').select('team_id').eq('id', id).maybeSingle();
  return canAccessTeam(locals, data?.team_id);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/teams');

  if (action === 'create') {
    const team_id = String(form.get('team_id') ?? '');
    const employee_id = String(form.get('employee_id') ?? '');
    const role = String(form.get('role') ?? 'member') as 'admin' | 'member';
    const role_description = String(form.get('role_description') ?? '') || null;
    if (!team_id || !employee_id) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });

    const { error } = await supabase
      .from('team_memberships')
      .insert({ team_id, employee_id, role, role_description });
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertMembershipAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const patch: Record<string, unknown> = {};
    const role = form.get('role');
    const role_description = form.get('role_description');
    if (role !== null) patch.role = String(role);
    if (role_description !== null) patch.role_description = String(role_description) || null;
    const { error } = await supabase.from('team_memberships').update(patch).eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertMembershipAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const { error } = await supabase.from('team_memberships').delete().eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'add_new_employee') {
    if (!isSystemAdmin(locals.user?.email)) return new Response('Forbidden', { status: 403 });
    const team_id = String(form.get('team_id') ?? '');
    const full_name = String(form.get('full_name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const role = String(form.get('role') ?? 'member') as 'admin' | 'member';
    const role_description = String(form.get('role_description') ?? '') || null;
    if (!team_id || !full_name || !email) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });

    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .upsert({ full_name, email }, { onConflict: 'email' })
      .select('id')
      .single();
    if (empErr) return new Response(`Error: ${empErr.message}`, { status: 500 });

    const { error: memErr } = await supabase
      .from('team_memberships')
      .upsert({ team_id, employee_id: emp.id, role, role_description }, { onConflict: 'team_id,employee_id' });
    if (memErr) return new Response(`Error: ${memErr.message}`, { status: 500 });
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
