import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';
// Teams are addressable by id or name, so integrations need not hardcode ids.
import { resolveTeamRef, resolveEmployeeByEmail } from '~/lib/api-lookup';

const TEAM_ROLES = new Set(['admin', 'member']);

async function resolveEmployee(body: any): Promise<string | null> {
  if (body?.employee_id) return String(body.employee_id);
  if (!body?.email) return null;
  return resolveEmployeeByEmail(String(body.email));
}

// ============================================================
// GET /api/v1/teams/:id/members
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const teamId = await resolveTeamRef(params.id!);
  if (!teamId) return json({ error: 'team not found' }, 404);

  let data: any[];
  try {
    data = await sql`
      select m.id, m.role, m.role_description, m.display_order,
             e.id as employee_id, e.full_name, e.email
      from team_memberships m
      join employees e on e.id = m.employee_id
      where m.team_id = ${teamId}
      order by m.display_order asc, e.full_name asc`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const members = (data ?? []).map((m: any) => ({
    membership_id: m.id,
    id: m.employee_id,
    name: m.full_name,
    email: m.email,
    role: m.role,
    role_description: m.role_description,
  }));

  return json({ team_id: teamId, members, count: members.length });
};

// ============================================================
// POST /api/v1/teams/:id/members — add someone to the team
// body: { email? | employee_id?, role? (admin|member), role_description? }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const teamId = await resolveTeamRef(params.id!);
  if (!teamId) return json({ error: 'team not found' }, 404);

  const employeeId = await resolveEmployee(body);
  if (!employeeId) return json({ error: 'email or employee_id is required and must match an existing employee' }, 400);

  const role = body.role ? String(body.role) : 'member';
  if (!TEAM_ROLES.has(role)) {
    return json({ error: `role must be one of: ${[...TEAM_ROLES].join(', ')}` }, 400);
  }

  let id: string;
  try {
    const rows = await sql`
      insert into team_memberships (team_id, employee_id, role, role_description)
      values (${teamId}, ${employeeId}, ${role},
              ${body.role_description ? String(body.role_description) : null})
      on conflict (team_id, employee_id) do update
        set role = excluded.role, role_description = excluded.role_description
      returning id`;
    id = (rows[0] as any).id;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ membership_id: id, team_id: teamId, employee_id: employeeId, role }, 201);
};

// ============================================================
// DELETE /api/v1/teams/:id/members — remove someone from the team
// body: { email? | employee_id? }
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const teamId = await resolveTeamRef(params.id!);
  if (!teamId) return json({ error: 'team not found' }, 404);

  const employeeId = await resolveEmployee(body);
  if (!employeeId) return json({ error: 'email or employee_id is required and must match an existing employee' }, 400);

  let result: any;
  try {
    result = await pool.query(
      'delete from team_memberships where team_id = $1 and employee_id = $2',
      [teamId, employeeId],
    );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (result.rowCount === 0) return json({ error: 'that employee is not on this team' }, 404);

  return new Response(null, { status: 204 });
};
