import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/links');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const url = String(form.get('url') ?? '').trim();
    if (!title || !url) return redirect(back);
    try {
      await sql`
        insert into links (title, url, description, category, is_private)
        values (
          ${title},
          ${url},
          ${String(form.get('description') ?? '') || null},
          ${String(form.get('category') ?? '') || null},
          ${form.get('is_private') === 'on'}
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
        update links set
          title = ${String(form.get('title') ?? '').trim()},
          url = ${String(form.get('url') ?? '').trim()},
          description = ${String(form.get('description') ?? '') || null},
          category = ${String(form.get('category') ?? '') || null},
          is_private = ${form.get('is_private') === 'on'}
        where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    try {
      await sql`delete from links where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
