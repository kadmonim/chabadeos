import type { APIRoute } from 'astro';
import { requireViewer } from '~/lib/crm/access';
import { addActivity, updateActivity, deleteActivity } from '~/lib/crm/activities';
import type { ActivityKind } from '~/lib/crm/types';
import { ACTIVITY_KINDS } from '~/lib/crm/types';

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
  const target = `${back}${back.includes('#') ? '' : '#timeline'}`;

  const bad = (message: string) => {
    const p = new URLSearchParams({ err: message });
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}#timeline`);
  };

  try {
    if (action === 'add') {
      const contactId = String(form.get('contact_id') ?? '');
      if (!contactId) return bad('חסר מזהה איש קשר');
      const kind = String(form.get('kind') ?? 'note');
      if (!(ACTIVITY_KINDS as readonly string[]).includes(kind) || kind === 'system') return bad('סוג פעילות לא תקין');
      const body = String(form.get('body') ?? '').trim();
      const occurredAt = String(form.get('occurred_at') ?? '').trim();
      await addActivity(viewer, contactId, {
        kind: kind as Exclude<ActivityKind, 'system'>,
        body,
        occurred_at: occurredAt || undefined,
      });
      return redirect(target);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const kind = String(form.get('kind') ?? '');
      const body = form.get('body');
      const occurredAt = String(form.get('occurred_at') ?? '').trim();
      const input: { body?: string; kind?: Exclude<ActivityKind, 'system'>; occurred_at?: string } = {};
      if (typeof body === 'string') input.body = body.trim();
      if (kind && (ACTIVITY_KINDS as readonly string[]).includes(kind) && kind !== 'system') {
        input.kind = kind as Exclude<ActivityKind, 'system'>;
      }
      if (occurredAt) input.occurred_at = occurredAt;
      const ok = await updateActivity(viewer, id, input);
      if (!ok) return bad('אין הרשאה לערוך פעילות זו');
      return redirect(target);
    }

    if (action === 'delete') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await deleteActivity(viewer, id);
      if (!ok) return bad('אין הרשאה למחוק פעילות זו');
      return redirect(target);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
