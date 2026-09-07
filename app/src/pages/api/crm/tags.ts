import type { APIRoute } from 'astro';
import { json } from '~/lib/api-auth';
import { requireViewer, requireAdmin } from '~/lib/crm/access';
import { setContactTags, createTag, updateTag, deleteTag } from '~/lib/crm/tags';
import { TAG_COLORS, type TagColor } from '~/lib/crm/types';

// Redirect targets come from a hidden form field: accept same-origin paths only.
const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : fallback);

export const PATCH: APIRoute = async ({ request, locals }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch {
    return json({ error: 'forbidden' }, 403);
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const contactId = String(body?.contact_id ?? '');
  if (!contactId) return json({ error: 'contact_id required' }, 400);
  const tagIds = Array.isArray(body?.tag_ids) ? body.tag_ids.map(String) : [];
  try {
    const ok = await setContactTags(viewer, contactId, tagIds);
    if (!ok) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
};

// POST is admin-only: create/update/delete tags, used by the settings page.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  let viewer;
  try {
    viewer = requireAdmin(locals);
  } catch (r) {
    return r as Response;
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const back = safeBack(form.get('back'), '/crm/settings');

  const bad = (message: string) => {
    const p = new URLSearchParams({ err: message });
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}`);
  };

  const str = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v || undefined;
  };

  try {
    if (action === 'create') {
      const name = str('name');
      if (!name) return bad('שם התגית חסר');
      const colorRaw = str('color');
      const color = ((TAG_COLORS as readonly string[]).includes(colorRaw ?? '') ? colorRaw : undefined) as TagColor | undefined;
      await createTag(viewer, name, color);
      return redirect(back);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const name = str('name');
      const colorRaw = str('color');
      const color = ((TAG_COLORS as readonly string[]).includes(colorRaw ?? '') ? colorRaw : undefined) as TagColor | undefined;
      const ok = await updateTag(viewer, id, { name, color });
      if (!ok) return bad('התגית לא נמצאה');
      return redirect(back);
    }

    if (action === 'delete') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await deleteTag(viewer, id);
      if (!ok) return bad('התגית לא נמצאה');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
