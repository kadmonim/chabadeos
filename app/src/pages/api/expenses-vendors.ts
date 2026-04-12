import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';

// Parses a textarea with one value per line into a clean string array.
function parseLines(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/expenses/vendors');

  if (action === 'create') {
    const name = String(form.get('name') ?? '').trim();
    if (!name) return redirect(back);
    const reportMatches = parseLines(String(form.get('report_matches') ?? ''));
    const { error } = await supabase
      .from('expenses_vendors')
      .insert({
        name,
        person_employee_id: String(form.get('person_employee_id') ?? '') || null,
        description: String(form.get('description') ?? '') || null,
        frequency: String(form.get('frequency') ?? '') || null,
        status: String(form.get('status') ?? '') || 'Unknown',
        group_name: String(form.get('group_name') ?? '') || 'Unknown',
        latest_update: String(form.get('latest_update') ?? '') || null,
        to_do: String(form.get('to_do') ?? '') || null,
        review_again: String(form.get('review_again') ?? '') || null,
        tags: parseLines(String(form.get('tags') ?? '')),
        aliases: parseLines(String(form.get('aliases') ?? '')),
        report_matches: reportMatches.length > 0 ? reportMatches : [name],
      });
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'update') {
    const vendorId = Number(form.get('vendor_id'));
    if (!Number.isInteger(vendorId)) return new Response('vendor_id required', { status: 400 });
    const { error } = await supabase
      .from('expenses_vendors')
      .update({
        name: String(form.get('name') ?? '').trim(),
        person_employee_id: String(form.get('person_employee_id') ?? '') || null,
        description: String(form.get('description') ?? '') || null,
        frequency: String(form.get('frequency') ?? '') || null,
        status: String(form.get('status') ?? '') || 'Unknown',
        group_name: String(form.get('group_name') ?? '') || 'Unknown',
        latest_update: String(form.get('latest_update') ?? '') || null,
        to_do: String(form.get('to_do') ?? '') || null,
        review_again: String(form.get('review_again') ?? '') || null,
        tags: parseLines(String(form.get('tags') ?? '')),
        aliases: parseLines(String(form.get('aliases') ?? '')),
        report_matches: parseLines(String(form.get('report_matches') ?? '')),
      })
      .eq('vendor_id', vendorId);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  if (action === 'delete') {
    const vendorId = Number(form.get('vendor_id'));
    const { error } = await supabase.from('expenses_vendors').delete().eq('vendor_id', vendorId);
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};
