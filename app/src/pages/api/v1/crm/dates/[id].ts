import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { updateDate, deleteDate } from '~/lib/crm/dates';

// ============================================================
// PATCH /api/v1/crm/dates/:id
// body: { kind?, date?, label? }
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
    ok = await updateDate(viewer, id!, {
      kind: body.kind,
      date: body.date,
      label: body.label,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/dates/:id
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let ok: boolean;
  try {
    ok = await deleteDate(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
