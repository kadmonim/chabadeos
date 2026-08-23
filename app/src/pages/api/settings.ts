import type { APIRoute } from 'astro';
import { setUiPrefs, type UiPrefs } from '~/lib/prefs';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const form = await request.formData();
  const prefs: UiPrefs = {};
  if (form.get('show_vto') === null) prefs.hide_vto = true;
  if (form.get('show_scorecard') === null) prefs.hide_scorecard = true;
  if (form.get('show_rooms') === null) prefs.hide_rooms = true;

  try {
    await setUiPrefs(user.employeeId, prefs);
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
  return redirect('/settings?saved=1', 303);
};
