import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { getHousehold, updateHousehold } from '~/lib/crm/households';
import type { HouseholdInput } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/households/:id
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let household;
  try {
    household = await getHousehold(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!household) return json({ error: 'not found' }, 404);

  return json({ household });
};

// ============================================================
// PATCH /api/v1/crm/households/:id
// body: HouseholdInput (+ owner_email instead of owner_employee_id)
// ============================================================
export const PATCH: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

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

  try {
    const updated = await updateHousehold(viewer, id!, input);
    if (!updated) return json({ error: 'not found' }, 404);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 500);
  }

  return new Response(null, { status: 204 });
};
