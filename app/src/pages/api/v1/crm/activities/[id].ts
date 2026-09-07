import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { updateActivity, deleteActivity } from '~/lib/crm/activities';

// ============================================================
// PATCH /api/v1/crm/activities/:id
// body: { body?, kind?, occurred_at? }
// ============================================================
export const PATCH: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  let ok: boolean;
  try {
    ok = await updateActivity(viewer, id!, {
      body: body.body,
      kind: body.kind,
      occurred_at: body.occurred_at,
    });
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/activities/:id
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let ok: boolean;
  try {
    ok = await deleteActivity(viewer, id!);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
