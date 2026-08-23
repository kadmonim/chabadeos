import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

// Milestones live under a rock but carry their own team_id + owner.
// Writes are team-gated: if a milestone has a team_id, the caller must be a member.
// Milestones with a null team_id behave like org-wide items (any authenticated user).

async function assertMilestoneWriteAccess(id: string, locals: App.Locals) {
  const rows = await sql`select team_id from milestones where id = ${id}`;
  const data = rows[0] ?? null;
  return canAccessTeam(locals, data?.team_id);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/rocks');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const rock_id = String(form.get('rock_id') ?? '') || null;
    const team_id = String(form.get('team_id') ?? '') || null;
    if (!title || !rock_id) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        insert into milestones (title, rock_id, team_id, description, owner_employee_id, due_date, status)
        values (
          ${title},
          ${rock_id},
          ${team_id},
          ${String(form.get('description') ?? '') || null},
          ${String(form.get('owner_employee_id') ?? '') || null},
          ${String(form.get('due_date') ?? '') || null},
          ${String(form.get('status') ?? 'on_track')}
        )`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertMilestoneWriteAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const new_team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, new_team_id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        update milestones set
          title = ${String(form.get('title') ?? '').trim()},
          description = ${String(form.get('description') ?? '') || null},
          owner_employee_id = ${String(form.get('owner_employee_id') ?? '') || null},
          team_id = ${new_team_id},
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
    if (!(await assertMilestoneWriteAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from milestones where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

const MILESTONE_PATCH_FIELDS = new Set(['status', 'description', 'title', 'due_date', 'owner_employee_id']);

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  if (!(await assertMilestoneWriteAccess(id, locals))) return new Response('Forbidden', { status: 403 });
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (MILESTONE_PATCH_FIELDS.has(k)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return new Response('no valid fields', { status: 400 });
  vals.push(id);
  try {
    await pool.query(`update milestones set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
