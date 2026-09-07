import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { upcomingDates } from '~/lib/crm/dates';

// ============================================================
// GET /api/v1/crm/upcoming
// query: ?days= (default 30), ?limit=
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const search = url.searchParams;
  const daysParam = search.get('days');
  const days = daysParam ? Number(daysParam) : undefined;
  const limitParam = search.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  let dates;
  try {
    dates = await upcomingDates(viewer, { days, limit });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ dates });
};
