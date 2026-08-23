import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canAccessExpenses } from '~/lib/permissions';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canAccessExpenses(locals)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/expenses/methods');

  if (action === 'create') {
    const name = String(form.get('name') ?? '').trim();
    if (!name) return redirect(back);
    try {
      await sql`
        insert into expense_methods (name, label, employee_id, notes)
        values (
          ${name},
          ${String(form.get('label') ?? '') || null},
          ${String(form.get('employee_id') ?? '') || null},
          ${String(form.get('notes') ?? '') || null}
        )`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    try {
      await sql`
        update expense_methods set
          name = ${String(form.get('name') ?? '').trim()},
          label = ${String(form.get('label') ?? '') || null},
          employee_id = ${String(form.get('employee_id') ?? '') || null},
          notes = ${String(form.get('notes') ?? '') || null}
        where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    try {
      await sql`delete from expense_methods where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
