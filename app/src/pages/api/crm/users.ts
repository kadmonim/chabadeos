import type { APIRoute } from 'astro';
import { requireAdmin, setCrmUser } from '~/lib/crm/access';
import type { CrmRole } from '~/lib/crm/types';

// Redirect targets come from a hidden form field: accept same-origin paths only.
const safeBack = (v: unknown, fallback: string) => (typeof v === 'string' && /^\/(?!\/)/.test(v) ? v : fallback);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    requireAdmin(locals);
  } catch (r) {
    return r as Response;
  }

  const form = await request.formData();
  const action = String(form.get('_action') ?? '');
  const back = safeBack(form.get('back'), '/crm/settings');
  const employeeId = String(form.get('employee_id') ?? '');

  const bad = (message: string) => {
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}err=${encodeURIComponent(message)}`);
  };

  if (!employeeId) return bad('חסר מזהה עובד');

  try {
    if (action === 'add' || action === 'set_role') {
      const role = String(form.get('role') ?? 'member') as CrmRole;
      if (role !== 'admin' && role !== 'member') return bad('תפקיד לא תקין');
      await setCrmUser(employeeId, role);
      return redirect(back);
    }

    if (action === 'remove') {
      await setCrmUser(employeeId, null);
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
