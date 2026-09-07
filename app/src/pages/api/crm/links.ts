import type { APIRoute } from 'astro';
import { requireViewer } from '~/lib/crm/access';
import { addLink, removeLink } from '~/lib/crm/links';
import { LINK_TYPES, type LinkType } from '~/lib/crm/types';

// Redirect targets come from a hidden form field: accept same-origin paths only.
const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : fallback);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch (r) {
    return r as Response;
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const back = safeBack(form.get('back'), '/crm');

  const bad = (message: string) => {
    const p = new URLSearchParams({ err: message });
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}`);
  };

  try {
    if (action === 'add') {
      const fromId = String(form.get('from_id') ?? '');
      const toId = String(form.get('to_id') ?? '');
      const typeRaw = String(form.get('type') ?? '');
      const note = String(form.get('note') ?? '').trim() || null;
      if (!fromId || !toId) return bad('חסר איש קשר');
      if (!(LINK_TYPES as readonly string[]).includes(typeRaw)) return bad('סוג קשר לא תקין');
      const result = await addLink(viewer, fromId, toId, typeRaw as LinkType, note);
      const sep = back.includes('?') ? '&' : '?';
      if (result.suggestFamily) return redirect(`${back}${sep}suggest_family=${toId}`);
      return redirect(back);
    }

    if (action === 'remove') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await removeLink(viewer, id);
      if (!ok) return bad('הקשר לא נמצא או שאין הרשאה להסירו');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
