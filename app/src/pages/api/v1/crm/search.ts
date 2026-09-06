import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { searchContacts } from '~/lib/crm/contacts';

// ============================================================
// GET /api/v1/crm/search?q=&limit=
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const q = url.searchParams.get('q') ?? '';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  let contacts;
  try {
    contacts = await searchContacts(viewer, q, limit);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ contacts });
};
