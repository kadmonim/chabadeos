import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';

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
    const { error } = await supabase.from('feature_ideas').insert({
      title, term_type, owner_employee_id, status: 'open', priority: 3,
    });
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    const tagsRaw = String(form.get('tags') ?? '');
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const patch: any = {
      title: String(form.get('title') ?? '').trim(),
      description: String(form.get('description') ?? '') || null,
      owner_employee_id: String(form.get('owner_employee_id') ?? '') || null,
      priority: Number(form.get('priority') ?? 3),
      type: String(form.get('type') ?? '') || null,
      term_type: String(form.get('term_type') ?? 'short_term'),
      tags,
    };
    const status = form.get('status');
    if (status) patch.status = String(status);
    const { error } = await supabase.from('feature_ideas').update(patch).eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    const { error } = await supabase.from('feature_ideas').delete().eq('id', id);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
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
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (PATCH_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return new Response('no valid fields', { status: 400 });
  const { error } = await supabase.from('feature_ideas').update(patch).eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
};
