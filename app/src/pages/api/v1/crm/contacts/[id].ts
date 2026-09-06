import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { getContact, updateContact, archiveContact, setShares } from '~/lib/crm/contacts';
import { telUrl, whatsappUrl } from '~/lib/crm/phone';
import type { ContactInput } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/contacts/:id
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let contact;
  try {
    contact = await getContact(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!contact) return json({ error: 'not found' }, 404);

  const phone_links = contact.phone
    ? { tel: telUrl(contact.phone), whatsapp: whatsappUrl(contact.phone) }
    : { tel: null, whatsapp: null };

  return json({ contact: { ...contact, phone_links } });
};

// ============================================================
// PATCH /api/v1/crm/contacts/:id
// body: ContactInput (+ owner_email, + shares?: string[] emails, + archived?: boolean)
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

  let shareIds: string[] | undefined;
  if (body.shares !== undefined) {
    shareIds = [];
    for (const email of body.shares as string[]) {
      const empId = await resolveEmployeeByEmail(String(email));
      if (!empId) return json({ error: `no employee with email '${email}'` }, 400);
      shareIds.push(empId);
    }
  }

  const input: ContactInput = { ...body };
  delete (input as any).owner_email;
  delete (input as any).shares;
  delete (input as any).archived;
  if (ownerEmployeeId !== undefined) input.owner_employee_id = ownerEmployeeId;

  try {
    const updated = await updateContact(viewer, id!, input);
    if (!updated) return json({ error: 'not found' }, 404);

    if (shareIds !== undefined) {
      await setShares(viewer, id!, shareIds);
    }

    if (body.archived !== undefined) {
      await archiveContact(viewer, id!, Boolean(body.archived));
    }
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 500);
  }

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/contacts/:id — archive
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let ok: boolean;
  try {
    ok = await archiveContact(viewer, id!, true);
  } catch (e) {
    const message = (e as Error).message || '';
    if (message.includes('הרשאה')) return json({ error: message }, 403);
    return json({ error: message }, 500);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
