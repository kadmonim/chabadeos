import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { data, error } = await supabase
    .from('teams')
    .select(`
      id, name, description,
      memberships:team_memberships(
        role, role_description, display_order,
        employee:employees(id, full_name, email)
      )
    `)
    .order('name');

  if (error) return json({ error: error.message }, 500);

  const teams = (data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    members: (t.memberships ?? [])
      .filter((m: any) => m.employee)
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((m: any) => ({
        id: m.employee.id,
        name: m.employee.full_name,
        email: m.employee.email,
        role: m.role,
        role_description: m.role_description,
      })),
  }));

  return json({ teams, count: teams.length });
};
