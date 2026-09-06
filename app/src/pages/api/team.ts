import type { APIRoute } from 'astro';
import { setCurrentTeam, canAccessTeam } from '~/lib/team';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const form = await request.formData();
  const teamId = String(form.get('team_id') ?? '');
  const back = String(form.get('back') ?? '/');
  if (teamId && canAccessTeam(locals, teamId)) setCurrentTeam(cookies, teamId);
  return redirect(back);
};
