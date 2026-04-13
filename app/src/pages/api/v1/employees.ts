import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const email = url.searchParams.get('email');

  let q = supabase.from('employees').select('id, full_name, email, created_at').order('full_name');
  if (email) q = q.ilike('email', email);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

  return json({
    employees: (data ?? []).map((e) => ({
      id: e.id,
      name: e.full_name,
      email: e.email,
      created_at: e.created_at,
    })),
    count: data?.length ?? 0,
  });
};
