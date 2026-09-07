import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { addLink, removeLink, linksFor } from '~/lib/crm/links';
import type { LinkType } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/contacts/:id/links
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let links;
  try {
    links = await linksFor(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ links });
};

// ============================================================
// POST /api/v1/crm/contacts/:id/links
// body: { to_contact_id, type, note? }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.to_contact_id) return json({ error: 'to_contact_id required' }, 400);
  if (!body.type) return json({ error: 'type required' }, 400);

  let result;
  try {
    result = await addLink(viewer, id!, String(body.to_contact_id), body.type as LinkType, body.note ?? null);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }

  return json({ id: result.id, suggest_family: result.suggestFamily }, 201);
};

// ============================================================
// DELETE /api/v1/crm/contacts/:id/links
// body: { id }
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  void params.id;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.id) return json({ error: 'id required' }, 400);

  let ok: boolean;
  try {
    ok = await removeLink(viewer, String(body.id));
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
