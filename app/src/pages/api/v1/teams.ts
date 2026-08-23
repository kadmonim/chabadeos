import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let data: any[];
  try {
    data = await sql`
      select
        t.id, t.name, t.description,
        coalesce((
          select json_agg(json_build_object(
            'role', m.role, 'role_description', m.role_description, 'display_order', m.display_order,
            'employee', case when e.id is null then null
                             else json_build_object('id', e.id, 'full_name', e.full_name, 'email', e.email) end
          ))
          from team_memberships m
          left join employees e on e.id = m.employee_id
          where m.team_id = t.id
        ), '[]'::json) as memberships
      from teams t
      order by t.name asc`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

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
