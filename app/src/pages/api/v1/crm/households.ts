import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listHouseholds, createHousehold } from '~/lib/crm/households';
import type { HouseholdInput } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/households
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const params = url.searchParams;
  const q = params.get('q');
  const limitParam = params.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const after = params.get('after');

  let page;
  try {
    page = await listHouseholds(viewer, { q: q ?? undefined, limit, after: after ?? null });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ households: page.items, count: page.items.length, total: page.total, next: page.next });
};

// ============================================================
// POST /api/v1/crm/households
// body: HouseholdInput but with owner_email instead of owner_employee_id
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  let ownerEmployeeId: string | null | undefined;
  if (body.owner_email !== undefined) {
    if (!body.owner_email) {
      ownerEmployeeId = null;
    } else {
      ownerEmployeeId = await resolveEmployeeByEmail(String(body.owner_email));
      if (!ownerEmployeeId) return json({ error: `no employee with email '${body.owner_email}'` }, 400);
    }
  }

  const input: HouseholdInput = { ...body };
  delete (input as any).owner_email;
  if (ownerEmployeeId !== undefined) input.owner_employee_id = ownerEmployeeId;

  let result;
  try {
    result = await createHousehold(viewer, input);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  return json({ id: result.id }, 201);
};
