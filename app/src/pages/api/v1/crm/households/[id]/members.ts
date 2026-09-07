import type { APIRoute } from 'astro';
import { HOUSEHOLD_ROLES } from '~/lib/crm/types';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { setMember } from '~/lib/crm/households';

// ============================================================
// POST /api/v1/crm/households/:id/members
// body: { contact_id, role }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.contact_id) return json({ error: 'contact_id required' }, 400);
  if (body.role != null && !(HOUSEHOLD_ROLES as readonly string[]).includes(body.role)) return json({ error: 'invalid role' }, 400);

  let ok: boolean;
  try {
    ok = await setMember(viewer, String(body.contact_id), id!, body.role ?? null);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/households/:id/members
// body: { contact_id }
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;
  void id;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.contact_id) return json({ error: 'contact_id required' }, 400);
  if (body.role != null && !(HOUSEHOLD_ROLES as readonly string[]).includes(body.role)) return json({ error: 'invalid role' }, 400);

  let ok: boolean;
  try {
    ok = await setMember(viewer, String(body.contact_id), null, null);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
