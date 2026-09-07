import type { APIRoute } from 'astro';
import { requireViewer } from '~/lib/crm/access';
import { createTask, updateTask, deleteTask } from '~/lib/crm/tasks';

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
  const back = safeBack(form.get('back'), '/crm/tasks');

  const bad = (message: string) => {
    const p = new URLSearchParams({ err: message });
    const sep = back.includes('?') ? '&' : '?';
    return redirect(`${back}${sep}${p}`);
  };

  try {
    if (action === 'create') {
      const contactId = String(form.get('contact_id') ?? '');
      if (!contactId) return bad('חסר מזהה איש קשר');
      const title = String(form.get('title') ?? '').trim();
      if (!title) return bad('כותרת חסרה');
      const dueDate = String(form.get('due_date') ?? '').trim();
      const assignee = String(form.get('assignee_employee_id') ?? '').trim();
      await createTask(viewer, contactId, {
        title,
        due_date: dueDate || null,
        assignee_employee_id: assignee || null,
      });
      return redirect(back);
    }

    if (action === 'toggle') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const done = String(form.get('done') ?? '') === '1';
      const ok = await updateTask(viewer, id, { done });
      if (!ok) return bad('אין הרשאה לעדכן משימה זו');
      return redirect(back);
    }

    if (action === 'update') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const title = String(form.get('title') ?? '').trim();
      const dueDate = form.get('due_date');
      const assignee = form.get('assignee_employee_id');
      const input: { title?: string; due_date?: string | null; assignee_employee_id?: string | null } = {};
      if (title) input.title = title;
      if (typeof dueDate === 'string') input.due_date = dueDate.trim() || null;
      if (typeof assignee === 'string') input.assignee_employee_id = assignee.trim() || null;
      const ok = await updateTask(viewer, id, input);
      if (!ok) return bad('אין הרשאה לערוך משימה זו');
      return redirect(back);
    }

    if (action === 'delete') {
      const id = String(form.get('id') ?? '');
      if (!id) return bad('חסר מזהה');
      const ok = await deleteTask(viewer, id);
      if (!ok) return bad('אין הרשאה למחוק משימה זו');
      return redirect(back);
    }

    return bad('פעולה לא מוכרת');
  } catch (e) {
    return bad((e as Error).message);
  }
};
