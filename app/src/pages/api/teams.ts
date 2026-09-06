import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/teams');

  if (action === 'create') {
    const name = String(form.get('name') ?? '').trim();
    if (!name) return redirect(back);
    const description = String(form.get('description') ?? '') || null;

    // Insert team + creating employee as admin member in one go.
    let team;
    try {
      const rows = await sql`
        insert into teams (name, description) values (${name}, ${description})
        returning id`;
      team = rows[0];
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }

    if (locals.user) {
      await sql`
        insert into team_memberships (team_id, employee_id, role)
        values (${team.id}, ${locals.user.employeeId}, 'admin')`;
    }
    return redirect(`/teams?edit=${team.id}`);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!canAccessTeam(locals, id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        update teams set
          name = ${String(form.get('name') ?? '').trim()},
          description = ${String(form.get('description') ?? '') || null}
        where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!canAccessTeam(locals, id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from teams where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect('/teams');
  }

  return new Response('unknown action', { status: 400 });
};
