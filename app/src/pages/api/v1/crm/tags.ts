import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listTags, createTag } from '~/lib/crm/tags';
import type { TagColor } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/tags
// ============================================================
export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;
  void viewer;

  let tags;
  try {
    tags = await listTags();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ tags });
};

// ============================================================
// POST /api/v1/crm/tags — admin only (SERVICE_VIEWER is admin; a member
// resolved via X-On-Behalf-Of is rejected by the service with 403)
// body: { name, color? }
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.name) return json({ error: 'name required' }, 400);

  let result;
  try {
    result = await createTag(viewer, String(body.name), body.color as TagColor | undefined);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 400);
  }

  return json({ id: result.id }, 201);
};
