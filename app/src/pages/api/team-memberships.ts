import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';
import { isSystemAdmin } from '~/lib/permissions';

async function assertMembershipAccess(id: string, locals: App.Locals) {
  const rows = await sql`select team_id from team_memberships where id = ${id}`;
  return canAccessTeam(locals, rows[0]?.team_id);
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

    try {
      await sql`
        insert into team_memberships (team_id, employee_id, role, role_description)
        values (${team_id}, ${employee_id}, ${role}, ${role_description})`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertMembershipAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const sets: string[] = [];
    const vals: unknown[] = [];
    const role = form.get('role');
    const role_description = form.get('role_description');
    if (role !== null) { vals.push(String(role)); sets.push(`role = $${vals.length}`); }
    if (role_description !== null) { vals.push(String(role_description) || null); sets.push(`role_description = $${vals.length}`); }
    if (!sets.length) return redirect(back);
    vals.push(id);
    try {
      await pool.query(`update team_memberships set ${sets.join(', ')} where id = $${vals.length}`, vals);
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertMembershipAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from team_memberships where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
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

    let emp;
    try {
      const rows = await sql`
        insert into employees (full_name, email) values (${full_name}, ${email})
        on conflict (email) do update set full_name = excluded.full_name
        returning id`;
      emp = rows[0];
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }

    try {
      await sql`
        insert into team_memberships (team_id, employee_id, role, role_description)
        values (${team_id}, ${emp.id}, ${role}, ${role_description})
        on conflict (team_id, employee_id) do update set
          role = excluded.role, role_description = excluded.role_description`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
