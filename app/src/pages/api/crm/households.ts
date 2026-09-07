import type { APIRoute } from 'astro';
import { json } from '~/lib/api-auth';
import { requireViewer } from '~/lib/crm/access';
import {
  searchHouseholds, createHousehold, updateHousehold, ensureFamilyFor, setMember, addFamilyMember,
} from '~/lib/crm/households';
import type { HouseholdInput, HouseholdRole } from '~/lib/crm/types';
import { HOUSEHOLD_ROLES } from '~/lib/crm/types';

// Redirect targets come from a hidden form field: accept same-origin paths only.
const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : fallback);

function householdInputFromForm(form: FormData): HouseholdInput {
  const str = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v || null;
  };
  return {
    name: str('name') ?? '',
    street: str('street'),
    city: str('city'),
    postal_code: str('postal_code'),
    notes: str('notes'),
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch {
    return json({ error: 'forbidden' }, 403);
  }
  const q = url.searchParams.get('q') ?? '';
  const results = await searchHouseholds(viewer, q, 8);
  return json(results);
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch (r) {
    return r as Response;
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const back = safeBack(form.get('back'), '/crm/families');

  const bad = (message: string) => {
    const p = new URLSearchParams({ err: message });
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}`);
  };

  try {
    if (action === 'create') {
      const input = householdInputFromForm(form);
      if (!input.name) return bad('שם המשפחה חסר');
      const result = await createHousehold(viewer, input);
      return redirect(`/crm/families/${result.id}`);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const input = householdInputFromForm(form);
      if (!input.name) return bad('שם המשפחה חסר');
      const ok = await updateHousehold(viewer, id, input);
      if (!ok) return bad('המשפחה לא נמצאה או שאין הרשאה לערוך אותה');
      return redirect(back);
    }

    if (action === 'add_member') {
      // From the contact page: contact_id anchors a family (created on demand
      // via ensureFamilyFor). From the family page: household_id is already
      // known, so no anchor contact is needed.
      const householdIdField = String(form.get('household_id') ?? '').trim();
      let householdId = householdIdField || null;
      if (!householdId) {
        const contactId = String(form.get('contact_id') ?? '');
        if (!contactId) return bad('חסר מזהה');
        householdId = (await ensureFamilyFor(viewer, contactId)).id;
      }
      const role = String(form.get('household_role') ?? 'other');
      const householdRole = ((HOUSEHOLD_ROLES as readonly string[]).includes(role) ? role : 'other') as HouseholdRole;

      const str = (k: string) => {
        const v = String(form.get(k) ?? '').trim();
        return v || null;
      };
      const result = await addFamilyMember(viewer, householdId, {
        first_name: str('first_name') ?? '',
        last_name: str('last_name'),
        phone: str('phone'),
        email: str('email'),
        gender: str('gender') as any,
        birthdate: str('birthdate'),
        household_role: householdRole,
      } as any);
      if ('duplicate' in result) return bad('איש קשר עם טלפון או אימייל זהה כבר קיים');
      return redirect(back);
    }

    if (action === 'set_family') {
      const contactId = String(form.get('contact_id') ?? '');
      if (!contactId) return bad('חסר מזהה איש קשר');
      const householdId = String(form.get('household_id') ?? '').trim() || null;
      const roleRaw = String(form.get('household_role') ?? '').trim();
      const role = (householdId && (HOUSEHOLD_ROLES as readonly string[]).includes(roleRaw) ? roleRaw : null) as HouseholdRole | null;
      const ok = await setMember(viewer, contactId, householdId, role);
      if (!ok) return bad('אין הרשאה לבצע פעולה זו');
      return redirect(back);
    }

    if (action === 'merge_spouse') {
      const contactId = String(form.get('contact_id') ?? '');
      const otherId = String(form.get('other_id') ?? '');
      if (!contactId || !otherId) return bad('חסרים פרטים');
      const { id: householdId } = await ensureFamilyFor(viewer, contactId);
      const ok = await setMember(viewer, otherId, householdId, 'spouse');
      if (!ok) return bad('אין הרשאה לבצע פעולה זו');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
