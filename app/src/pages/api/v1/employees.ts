import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

const TEAM_ROLES = new Set(['admin', 'member']);

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const email = url.searchParams.get('email');

  let data: any[];
  try {
    data = email
      ? await sql`select id, full_name, email, created_at from employees where email ilike ${email} order by full_name asc`
      : await sql`select id, full_name, email, created_at from employees order by full_name asc`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

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

// ============================================================
// POST /api/v1/employees — create an employee
// body: { full_name (required), email (required), team_id? | team_name?, role? }
// Passing a team also adds the new employee to it.
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!fullName) return json({ error: 'full_name is required' }, 400);
  if (!email) return json({ error: 'email is required' }, 400);

  const existing = await sql`select id from employees where email ilike ${email}`;
  if (existing[0]) {
    return json({ error: `an employee with email '${email}' already exists`, id: (existing[0] as any).id }, 409);
  }

  let teamId: string | null = null;
  if (body.team_id || body.team_name) {
    teamId = body.team_id
      ? String(body.team_id)
      : ((await sql`select id from teams where name ilike ${String(body.team_name)}`)[0] as any)?.id ?? null;
    if (!teamId) return json({ error: 'team not found' }, 400);
  }

  const role = body.role ? String(body.role) : 'member';
  if (!TEAM_ROLES.has(role)) {
    return json({ error: `role must be one of: ${[...TEAM_ROLES].join(', ')}` }, 400);
  }

  let id: string;
  try {
    const rows = await sql`
      insert into employees (full_name, email) values (${fullName}, ${email}) returning id`;
    id = (rows[0] as any).id;
    if (teamId) {
      await sql`
        insert into team_memberships (team_id, employee_id, role)
        values (${teamId}, ${id}, ${role})`;
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id, team_id: teamId }, 201);
};

// ============================================================
// PATCH /api/v1/employees — rename or change the email of an employee
// body: { id? | email? (to identify), full_name?, new_email? }
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  let id = body?.id ? String(body.id) : '';
  if (!id) {
    if (!body?.email) return json({ error: 'id or email is required' }, 400);
    const rows = await sql`select id from employees where email ilike ${String(body.email)}`;
    if (!rows[0]) return json({ error: `no employee with email '${body.email}'` }, 404);
    id = (rows[0] as any).id;
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const applied: Record<string, unknown> = {};
  if (body.full_name !== undefined) {
    const fullName = String(body.full_name).trim();
    if (!fullName) return json({ error: 'full_name cannot be empty' }, 400);
    vals.push(fullName);
    sets.push(`full_name = $${vals.length}`);
    applied.full_name = fullName;
  }
  if (body.new_email !== undefined) {
    const newEmail = String(body.new_email).trim().toLowerCase();
    if (!newEmail) return json({ error: 'new_email cannot be empty' }, 400);
    vals.push(newEmail);
    sets.push(`email = $${vals.length}`);
    applied.email = newEmail;
  }
  if (sets.length === 0) return json({ error: 'no updatable fields provided' }, 400);

  vals.push(id);
  let result: any;
  try {
    result = await pool.query(
      `update employees set ${sets.join(', ')} where id = $${vals.length} returning id`,
      vals,
    );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (result.rowCount === 0) return json({ error: `no employee with id '${id}'` }, 404);

  return json({ id, ...applied });
};
