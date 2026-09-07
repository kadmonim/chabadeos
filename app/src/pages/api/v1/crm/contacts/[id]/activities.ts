import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listActivities, addActivity } from '~/lib/crm/activities';
import type { ActivityKind } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/contacts/:id/activities
// query: ?limit=, ?before= (occurred_at cursor)
// ============================================================
export const GET: APIRoute = async ({ request, params, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;
  const search = url.searchParams;
  const limitParam = search.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const before = search.get('before');

  let result;
  try {
    result = await listActivities(viewer, id!, { limit, before: before ?? null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ activities: result.items, next: result.next });
};

// ============================================================
// POST /api/v1/crm/contacts/:id/activities
// body: { kind, body, occurred_at? }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.kind) return json({ error: 'kind required' }, 400);

  let result;
  try {
    result = await addActivity(viewer, id!, {
      kind: body.kind as Exclude<ActivityKind, 'system'>,
      body: body.body,
      occurred_at: body.occurred_at,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  return json({ id: result.id }, 201);
};
