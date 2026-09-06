import type { APIRoute } from 'astro';
import { requireViewer } from '~/lib/crm/access';
import { createContact, updateContact, archiveContact, setShares } from '~/lib/crm/contacts';
import type { ContactInput, Stage, Visibility } from '~/lib/crm/types';
import { STAGES, VISIBILITIES } from '~/lib/crm/types';

// Fields worth echoing back as f_* when a create/update is rejected, so the
// drawer reopens with exactly what the user typed.
const KEEP = [
  'first_name', 'last_name', 'phone', 'email', 'gender', 'birthdate',
  'stage', 'owner_employee_id', 'visibility', 'source', 'notes',
];

function reopen(form: FormData): [string, string] | null {
  const action = String(form.get('_action') ?? '');
  const id = String(form.get('id') ?? '');
  if (action === 'create') return ['add', '1'];
  if (!id) return null;
  return ['edit', id];
}

function inputFromForm(form: FormData): ContactInput {
  const str = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v || null;
  };
  const stage = str('stage');
  const visibility = str('visibility');
  return {
    first_name: String(form.get('first_name') ?? '').trim(),
    last_name: str('last_name') ?? '',
    phone: str('phone'),
    email: str('email'),
    gender: str('gender') as ContactInput['gender'],
    birthdate: str('birthdate'),
    stage: (stage && (STAGES as readonly string[]).includes(stage) ? stage : 'new') as Stage,
    owner_employee_id: str('owner_employee_id'),
    visibility: (visibility && (VISIBILITIES as readonly string[]).includes(visibility) ? visibility : 'public') as Visibility,
    source: str('source'),
    notes: str('notes'),
  };
}

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
    const panel = reopen(form);
    if (panel) p.set(panel[0], panel[1]);
    for (const key of KEEP) {
      const v = form.get(key);
      if (typeof v === 'string' && v) p.set(`f_${key}`, v);
    }
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}`);
  };

  try {
    if (action === 'create') {
      const input = inputFromForm(form);
      if (!input.first_name) return bad('שם פרטי חסר');
      const result = await createContact(viewer, input);
      if ('duplicate' in result) {
        const dup = result.duplicate;
        const p = new URLSearchParams({
          err: 'איש קשר עם טלפון או אימייל זהה כבר קיים',
          dup: dup.id,
          add: '1',
        });
        for (const key of KEEP) {
          const v = form.get(key);
          if (typeof v === 'string' && v) p.set(`f_${key}`, v);
        }
        const sep = back.includes('?') ? '&' : '?';
        return redirect(`${back}${sep}${p}`);
      }
      return redirect(`/crm/contacts/${result.id}`);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const input = inputFromForm(form);
      if (!input.first_name) return bad('שם פרטי חסר');
      const ok = await updateContact(viewer, id, input);
      if (!ok) return bad('איש הקשר לא נמצא או שאין הרשאה לערוך אותו');
      return redirect(back);
    }

    if (action === 'archive' || action === 'unarchive') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await archiveContact(viewer, id, action === 'archive');
      if (!ok) return bad('אין הרשאה לבצע פעולה זו');
      return redirect(action === 'archive' ? '/crm' : back);
    }

    if (action === 'set_stage' || action === 'set_owner' || action === 'set_visibility') {
      const id = String(form.get('id') ?? '');
      const value = String(form.get('value') ?? '').trim();
      if (!id) return bad('חסר מזהה');
      const input: ContactInput =
        action === 'set_stage' ? { stage: value as Stage }
        : action === 'set_owner' ? { owner_employee_id: value || null }
        : { visibility: value as Visibility };
      const ok = await updateContact(viewer, id, input);
      if (!ok) return bad('אין הרשאה לבצע פעולה זו');
      return redirect(back);
    }

    if (action === 'set_shares') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const employeeIds = form.getAll('employee_ids[]').map(String).filter(Boolean);
      const ok = await setShares(viewer, id, employeeIds);
      if (!ok) return bad('אין הרשאה לבצע פעולה זו');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch (r) {
    return r as Response;
  }
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }
  const { id, ...rest } = body ?? {};
  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  try {
    const ok = await updateContact(viewer, id, rest as ContactInput);
    if (!ok) return new Response(null, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 });
  }
};
