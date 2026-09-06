import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listContacts, createContact } from '~/lib/crm/contacts';
import type { ContactFilter, ContactInput, ContactSort, Stage } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/contacts
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const params = url.searchParams;

  const filter: ContactFilter = {};
  const q = params.get('q');
  if (q) filter.q = q;

  const stageParam = params.get('stage');
  if (stageParam) {
    const stages = stageParam.split(',').map((s) => s.trim()).filter(Boolean) as Stage[];
    filter.stage = stages.length === 1 ? stages[0] : stages;
  }

  const tag = params.get('tag');
  if (tag) filter.tag = tag;

  const ownerEmail = params.get('owner');
  if (ownerEmail) {
    const ownerId = await resolveEmployeeByEmail(ownerEmail);
    if (!ownerId) return json({ contacts: [], count: 0, total: 0, next: null });
    filter.owner = ownerId;
  }

  const household = params.get('household');
  if (household) filter.household = household;

  const visibility = params.get('visibility');
  if (visibility) filter.visibility = visibility as ContactFilter['visibility'];

  const updatedSince = params.get('updated_since');
  if (updatedSince) filter.updated_since = updatedSince;

  if (params.get('archived') === '1') filter.archived = true;

  const sort = params.get('sort') as ContactSort | null;
  const dir = params.get('dir') as 'asc' | 'desc' | null;
  const limitParam = params.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const after = params.get('after');

  let page;
  try {
    page = await listContacts(viewer, filter, {
      sort: sort ?? undefined,
      dir: dir ?? undefined,
      limit,
      after: after ?? null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ contacts: page.items, count: page.items.length, total: page.total, next: page.next });
};

// ============================================================
// POST /api/v1/crm/contacts
// body: ContactInput but with owner_email instead of owner_employee_id,
//       plus force?: boolean (or ?force=1)
// ============================================================
export const POST: APIRoute = async ({ request, url }) => {
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

  const input: ContactInput = { ...body };
  delete (input as any).owner_email;
  delete (input as any).force;
  if (ownerEmployeeId !== undefined) input.owner_employee_id = ownerEmployeeId;

  const force = body.force === true || url.searchParams.get('force') === '1';

  let result;
  try {
    result = await createContact(viewer, input, { force });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  if ('duplicate' in result) {
    // Only the id: the match may be a contact this viewer cannot see.
    return json({ error: 'duplicate', existing: { id: result.duplicate.id } }, 409);
  }

  return json({ id: result.id }, 201);
};
