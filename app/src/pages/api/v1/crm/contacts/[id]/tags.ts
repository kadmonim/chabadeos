import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listTags, setContactTags, addContactTag, removeContactTag } from '~/lib/crm/tags';

// Resolve a list of tag ids-or-names to ids; throws-free — collects unknowns.
async function resolveTagIds(values: unknown[]): Promise<{ ids: string[]; unknown: string[] }> {
  const tags = await listTags();
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const v of values) {
    const value = String(v);
    const byId = tags.find((t) => t.id === value);
    if (byId) { ids.push(byId.id); continue; }
    const byName = tags.find((t) => t.name.toLowerCase() === value.toLowerCase());
    if (byName) { ids.push(byName.id); continue; }
    unknown.push(value);
  }
  return { ids, unknown };
}

// ============================================================
// PUT /api/v1/crm/contacts/:id/tags
// body: { tags: string[] } (ids or names; names resolved via listTags)
// ============================================================
export const PUT: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!Array.isArray(body.tags)) return json({ error: 'tags must be an array' }, 400);

  const { ids, unknown } = await resolveTagIds(body.tags);
  if (unknown.length) return json({ error: `unknown tag(s): ${unknown.join(', ')}` }, 400);

  let ok: boolean;
  try {
    ok = await setContactTags(viewer, id!, ids);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// POST /api/v1/crm/contacts/:id/tags
// body: { tag } (id or name)
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.tag) return json({ error: 'tag required' }, 400);

  const { ids, unknown } = await resolveTagIds([body.tag]);
  if (unknown.length) return json({ error: `unknown tag(s): ${unknown.join(', ')}` }, 400);

  let ok: boolean;
  try {
    ok = await addContactTag(viewer, id!, ids[0]);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/contacts/:id/tags
// body: { tag } (id or name)
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.tag) return json({ error: 'tag required' }, 400);

  const { ids, unknown } = await resolveTagIds([body.tag]);
  if (unknown.length) return json({ error: `unknown tag(s): ${unknown.join(', ')}` }, 400);

  let ok: boolean;
  try {
    ok = await removeContactTag(viewer, id!, ids[0]);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
