import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const q = url.searchParams.get('q');
  const category = url.searchParams.get('category');
  const employeeId = url.searchParams.get('employee_id');

  let query = supabase
    .from('contacts')
    .select(`
      id, name, category, real_first_name, nicknames,
      private_cell_number, anonymous_number, whatsapp_number,
      private_email, anonymous_email, location, about, is_private,
      employee_id, created_at, updated_at
    `)
    .order('name');

  if (q) query = query.or(`name.ilike.%${q}%,nicknames.ilike.%${q}%,private_email.ilike.%${q}%`);
  if (category) query = query.eq('category', category);
  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  return json({
    contacts: data ?? [],
    count: data?.length ?? 0,
  });
};
