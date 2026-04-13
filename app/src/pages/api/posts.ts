import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';

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
    let q = supabase.from('posts').select('id').eq('slug', slug).limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
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
    const { error, data } = await supabase.from('posts').insert({
      kind,
      headline,
      slug,
      summary: String(form.get('summary') ?? '').trim() || null,
      rich_text: String(form.get('rich_text') ?? '') || null,
      category: String(form.get('category') ?? '').trim() || null,
      source: String(form.get('source') ?? '').trim() || null,
      source_link: String(form.get('source_link') ?? '').trim() || null,
      from_username: String(form.get('from_username') ?? '').trim() || null,
      image_url: String(form.get('image_url') ?? '').trim() || null,
      video_url: String(form.get('video_url') ?? '').trim() || null,
      screenshot_url: String(form.get('screenshot_url') ?? '').trim() || null,
      date: String(form.get('date') ?? '') || today(),
      featured_in_newsletter: form.get('featured_in_newsletter') === 'on',
    }).select('slug').single();
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
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
    const { error, data } = await supabase.from('posts').update(patch).eq('id', id).select('slug').single();
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(`/posts/${data.slug}`);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

const PATCH_FIELDS = new Set(['rich_text', 'summary', 'headline']);

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (PATCH_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return new Response('no valid fields', { status: 400 });
  const { error } = await supabase.from('posts').update(patch).eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
