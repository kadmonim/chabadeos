import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';

function parseResponsibilities(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/chart');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const parent_id = String(form.get('parent_id') ?? '') || null;
    if (!title) return redirect(back);
    try {
      await sql`
        insert into org_seats (title, parent_id, employee_id, person_name, responsibilities)
        values (
          ${title},
          ${parent_id},
          ${String(form.get('employee_id') ?? '') || null},
          ${String(form.get('person_name') ?? '') || null},
          ${JSON.stringify(parseResponsibilities(String(form.get('responsibilities') ?? '')))}::jsonb
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
        update org_seats set
          title = ${String(form.get('title') ?? '').trim()},
          employee_id = ${String(form.get('employee_id') ?? '') || null},
          person_name = ${String(form.get('person_name') ?? '') || null},
          responsibilities = ${JSON.stringify(parseResponsibilities(String(form.get('responsibilities') ?? '')))}::jsonb
        where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    try {
      await sql`delete from org_seats where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
