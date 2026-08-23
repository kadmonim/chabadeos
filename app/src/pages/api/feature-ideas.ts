import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/feature-ideas');

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const term_type = (String(form.get('term_type') ?? 'short_term')) as 'short_term' | 'long_term' | 'idea_backlog';
    const owner_employee_id = String(form.get('owner_employee_id') ?? '') || null;
    if (!title) return redirect(back);
    try {
      await sql`
        insert into feature_ideas (title, term_type, owner_employee_id, status, priority)
        values (${title}, ${term_type}, ${owner_employee_id}, ${'open'}, ${3})`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    const tagsRaw = String(form.get('tags') ?? '');
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const vals: unknown[] = [
      String(form.get('title') ?? '').trim(),
      String(form.get('description') ?? '') || null,
      String(form.get('owner_employee_id') ?? '') || null,
      Number(form.get('priority') ?? 3),
      String(form.get('type') ?? '') || null,
      String(form.get('term_type') ?? 'short_term'),
      tags,
    ];
    let setClause = 'title = $1, description = $2, owner_employee_id = $3, priority = $4, type = $5, term_type = $6, tags = $7';
    const status = form.get('status');
    if (status) {
      vals.push(String(status));
      setClause += `, status = $${vals.length}`;
    }
    vals.push(id);
    try {
      await pool.query(`update feature_ideas set ${setClause} where id = $${vals.length}`, vals);
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    try {
      await sql`delete from feature_ideas where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

const PATCH_FIELDS = new Set(['status', 'description', 'title', 'priority', 'type', 'term_type', 'tags']);

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (PATCH_FIELDS.has(k)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return new Response('no valid fields', { status: 400 });
  vals.push(id);
  try {
    await pool.query(`update feature_ideas set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
