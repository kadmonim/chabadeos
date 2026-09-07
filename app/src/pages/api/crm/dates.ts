import type { APIRoute } from 'astro';
import { requireViewer } from '~/lib/crm/access';
import { addDate, updateDate, deleteDate } from '~/lib/crm/dates';
import type { DateKind } from '~/lib/crm/types';
import { DATE_KINDS } from '~/lib/crm/types';

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
      const contactId = String(form.get('contact_id') ?? '');
      if (!contactId) return bad('חסר מזהה איש קשר');
      const kind = String(form.get('kind') ?? '');
      if (!(DATE_KINDS as readonly string[]).includes(kind)) return bad('סוג תאריך לא תקין');
      const date = String(form.get('date') ?? '').trim();
      if (!date) return bad('תאריך חסר');
      const label = String(form.get('label') ?? '').trim();
      await addDate(viewer, contactId, { kind: kind as DateKind, date, label: label || null });
      return redirect(back);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const kind = String(form.get('kind') ?? '');
      const date = form.get('date');
      const label = form.get('label');
      const input: { kind?: DateKind; date?: string; label?: string | null } = {};
      if (kind && (DATE_KINDS as readonly string[]).includes(kind)) input.kind = kind as DateKind;
      if (typeof date === 'string' && date.trim()) input.date = date.trim();
      if (typeof label === 'string') input.label = label.trim() || null;
      const ok = await updateDate(viewer, id, input);
      if (!ok) return bad('אין הרשאה לערוך תאריך זה');
      return redirect(back);
    }

    if (action === 'delete') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await deleteDate(viewer, id);
      if (!ok) return bad('אין הרשאה למחוק תאריך זה');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
