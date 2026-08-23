import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'upsert');
  const back = String(form.get('back') ?? '/focus');

  if (action === 'upsert') {
    const team_id = String(form.get('team_id') ?? '');
    const employee_id = String(form.get('employee_id') ?? '');
    const focus_text = String(form.get('focus_text') ?? '').trim();
    const existingId = String(form.get('existing_id') ?? '');

    if (!team_id || !employee_id) return new Response('team_id + employee_id required', { status: 400 });
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });

    if (!focus_text) {
      if (existingId) {
        await sql`delete from current_focuses where id = ${existingId}`;
      }
      return redirect(back);
    }

    if (existingId) {
      try {
        await sql`update current_focuses set focus_text = ${focus_text} where id = ${existingId}`;
      } catch (e) {
        return new Response((e as Error).message, { status: 500 });
      }
    } else {
      try {
        await sql`insert into current_focuses (team_id, employee_id, focus_text) values (${team_id}, ${employee_id}, ${focus_text})`;
      } catch (e) {
        return new Response((e as Error).message, { status: 500 });
      }
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
