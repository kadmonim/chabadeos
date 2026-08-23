import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const data = excludeId
      ? await sql`select id from posts where slug = ${slug} and id <> ${excludeId} limit 1`
      : await sql`select id from posts where slug = ${slug} limit 1`;
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/posts');

  if (action === 'create') {
    const kind = String(form.get('kind') ?? 'post');
    const headline = String(form.get('headline') ?? '').trim();
    if (!headline) return redirect(back);
    const slug = await uniqueSlug(slugify(headline));
    let data;
    try {
      const rows = await sql`
        insert into posts (kind, headline, slug, summary, rich_text, category, source, source_link, from_username, image_url, video_url, screenshot_url, date, featured_in_newsletter)
        values (
          ${kind},
          ${headline},
          ${slug},
          ${String(form.get('summary') ?? '').trim() || null},
          ${String(form.get('rich_text') ?? '') || null},
          ${String(form.get('category') ?? '').trim() || null},
          ${String(form.get('source') ?? '').trim() || null},
          ${String(form.get('source_link') ?? '').trim() || null},
          ${String(form.get('from_username') ?? '').trim() || null},
          ${String(form.get('image_url') ?? '').trim() || null},
          ${String(form.get('video_url') ?? '').trim() || null},
          ${String(form.get('screenshot_url') ?? '').trim() || null},
          ${String(form.get('date') ?? '') || today()},
          ${form.get('featured_in_newsletter') === 'on'}
        )
        returning slug`;
      data = rows[0];
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(`/posts/${data.slug}`);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    const headline = String(form.get('headline') ?? '').trim();
    const patch: Record<string, unknown> = {
      kind: String(form.get('kind') ?? 'post'),
      headline: headline || null,
      summary: String(form.get('summary') ?? '').trim() || null,
      rich_text: String(form.get('rich_text') ?? '') || null,
      category: String(form.get('category') ?? '').trim() || null,
      source: String(form.get('source') ?? '').trim() || null,
      source_link: String(form.get('source_link') ?? '').trim() || null,
      from_username: String(form.get('from_username') ?? '').trim() || null,
      image_url: String(form.get('image_url') ?? '').trim() || null,
      video_url: String(form.get('video_url') ?? '').trim() || null,
      screenshot_url: String(form.get('screenshot_url') ?? '').trim() || null,
      date: String(form.get('date') ?? '') || null,
      featured_in_newsletter: form.get('featured_in_newsletter') === 'on',
    };
    if (form.get('reslug') === '1' && headline) {
      patch.slug = await uniqueSlug(slugify(headline), id);
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
    vals.push(id);
    let data;
    try {
      const { rows } = await pool.query(`update posts set ${sets.join(', ')} where id = $${vals.length} returning slug`, vals);
      data = rows[0];
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    if (!data) return new Response('Error: no rows returned', { status: 500 });
    return redirect(`/posts/${data.slug}`);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    try {
      await sql`delete from posts where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

const PATCH_FIELDS = new Set(['rich_text', 'summary', 'headline']);

export const PATCH: APIRoute = async ({ request }) => {
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
    await pool.query(`update posts set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
