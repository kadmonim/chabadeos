import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

const TEAM_ROLES = new Set(['admin', 'member']);

async function resolveTeam(idOrName: string): Promise<{ id: string; name: string } | null> {
  const rows = await sql`
    select id, name from teams where id = ${idOrName} or name ilike ${idOrName} limit 1`;
  return (rows[0] as any) ?? null;
}

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

// ============================================================
// POST /api/v1/teams — create a team
// body: { name (required), description?, members? [{ email, role?, role_description? }] }
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return json({ error: 'name is required' }, 400);

  const existing = await resolveTeam(name);
  if (existing) {
    return json({ error: `a team named '${existing.name}' already exists`, id: existing.id }, 409);
  }

  // Resolve every member up front so a bad email fails before the team exists.
  const members: { employeeId: string; role: string; roleDescription: string | null }[] = [];
  if (body.members !== undefined) {
    if (!Array.isArray(body.members)) return json({ error: 'members must be an array' }, 400);
    for (const m of body.members) {
      const role = m?.role ? String(m.role) : 'member';
      if (!TEAM_ROLES.has(role)) {
        return json({ error: `role must be one of: ${[...TEAM_ROLES].join(', ')}` }, 400);
      }
      let employeeId = m?.employee_id ? String(m.employee_id) : null;
      if (!employeeId && m?.email) {
        const rows = await sql`select id from employees where email ilike ${String(m.email)}`;
        employeeId = (rows[0] as any)?.id ?? null;
        if (!employeeId) return json({ error: `no employee with email '${m.email}'` }, 400);
      }
      if (!employeeId) return json({ error: 'each member needs an email or employee_id' }, 400);
      members.push({
        employeeId,
        role,
        roleDescription: m.role_description ? String(m.role_description) : null,
      });
    }
  }

  let id: string;
  try {
    const rows = await sql`
      insert into teams (name, description)
      values (${name}, ${body.description ? String(body.description) : null})
      returning id`;
    id = (rows[0] as any).id;
    for (const [i, m] of members.entries()) {
      await sql`
        insert into team_memberships (team_id, employee_id, role, role_description, display_order)
        values (${id}, ${m.employeeId}, ${m.role}, ${m.roleDescription}, ${i})`;
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id, name, members_added: members.length }, 201);
};

// ============================================================
// PATCH /api/v1/teams — rename a team or change its description
// body: { id? | team_name? (to identify), name?, description? }
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const key = body?.id ? String(body.id) : (body?.team_name ? String(body.team_name) : '');
  if (!key) return json({ error: 'id or team_name is required' }, 400);
  const team = await resolveTeam(key);
  if (!team) return json({ error: 'team not found' }, 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const applied: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return json({ error: 'name cannot be empty' }, 400);
    vals.push(name);
    sets.push(`name = $${vals.length}`);
    applied.name = name;
  }
  if (body.description !== undefined) {
    const description = body.description ? String(body.description) : null;
    vals.push(description);
    sets.push(`description = $${vals.length}`);
    applied.description = description;
  }
  if (sets.length === 0) return json({ error: 'no updatable fields provided' }, 400);

  vals.push(team.id);
  try {
    await pool.query(`update teams set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: team.id, ...applied });
};

// ============================================================
// DELETE /api/v1/teams — delete a team
// body: { id? | team_name?, confirm_name (must equal the team's exact name) }
// Memberships go with it; issues/todos/rocks keep existing but lose their team.
// ============================================================
export const DELETE: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const key = body?.id ? String(body.id) : (body?.team_name ? String(body.team_name) : '');
  if (!key) return json({ error: 'id or team_name is required' }, 400);
  const team = await resolveTeam(key);
  if (!team) return json({ error: 'team not found' }, 404);

  if (String(body?.confirm_name ?? '') !== team.name) {
    return json({
      error: `deleting a team is irreversible — resend with "confirm_name": "${team.name}"`,
    }, 400);
  }

  try {
    await sql`delete from teams where id = ${team.id}`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ deleted: team.id, name: team.name });
};
