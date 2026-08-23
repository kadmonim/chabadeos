import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

// ---------- helpers ----------
async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const rows = await sql`select id from employees where email ilike ${email}`;
  return (rows[0] as any)?.id ?? null;
}
async function resolveTeam(teamId: string | null, teamName: string | null): Promise<string | null> {
  if (teamId) return teamId;
  if (!teamName) return null;
  const rows = await sql`select id from teams where name ilike ${teamName}`;
  return (rows[0] as any)?.id ?? null;
}

// ============================================================
// GET /api/v1/issues
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const ownerEmail = url.searchParams.get('assignee') ?? url.searchParams.get('owner');
  const teamId = url.searchParams.get('team_id');
  const status = url.searchParams.get('status') ?? 'open';
  const term = url.searchParams.get('term');

  let ownerId: string | null = null;
  if (ownerEmail) {
    ownerId = await resolveEmployeeByEmail(ownerEmail);
    if (!ownerId) return json({ issues: [], count: 0, note: `no employee with email '${ownerEmail}'` });
  }

  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (ownerId) {
    vals.push(ownerId);
    wheres.push(`i.owner_employee_id = $${vals.length}`);
  }
  if (teamId) {
    vals.push(teamId);
    wheres.push(`i.team_id = $${vals.length}`);
  }
  if (status !== 'all') {
    vals.push(status);
    wheres.push(`i.status = $${vals.length}`);
  }
  if (term) {
    vals.push(term);
    wheres.push(`i.term_type = $${vals.length}`);
  }

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        i.id, i.title, i.description, i.status, i.priority, i.priority_order,
        i.type, i.term_type, i.created_at, i.updated_at,
        case when t.id is null then null
             else json_build_object('id', t.id, 'name', t.name) end as team,
        case when o.id is null then null
             else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner
      from issues i
      left join teams t on t.id = i.team_id
      left join employees o on o.id = i.owner_employee_id
      ${wheres.length ? `where ${wheres.join(' and ')}` : ''}
      order by i.priority_order asc`,
      vals,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const issues = (data ?? []).map((i: any) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    status: i.status,
    priority: i.priority,
    priority_order: i.priority_order,
    type: i.type,
    term_type: i.term_type,
    created_at: i.created_at,
    updated_at: i.updated_at,
    team: i.team ? { id: i.team.id, name: i.team.name } : null,
    owner: i.owner ? { id: i.owner.id, name: i.owner.full_name, email: i.owner.email } : null,
  }));

  return json({ issues, count: issues.length });
};

// ============================================================
// POST /api/v1/issues — create a new issue
// body: { title (required), description?, owner_email?, team_id? or team_name?,
//         term_type? ('short_term' | 'long_term' | 'idea_backlog', default 'short_term'),
//         type? ('problem'|'idea'|'question'|'brainstorm'|'update'),
//         priority? (1-5) }
// ============================================================
const ALLOWED_ISSUE_TYPES = new Set(['problem', 'idea', 'question', 'brainstorm', 'update']);
const ALLOWED_TERMS = new Set(['short_term', 'long_term', 'idea_backlog']);

export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return json({ error: 'title is required' }, 400);

  const ownerId = body.owner_email
    ? await resolveEmployeeByEmail(String(body.owner_email))
    : null;
  if (body.owner_email && !ownerId) {
    return json({ error: `no employee with email '${body.owner_email}'` }, 400);
  }

  const teamId = await resolveTeam(
    body.team_id ? String(body.team_id) : null,
    body.team_name ? String(body.team_name) : null,
  );
  if ((body.team_id || body.team_name) && !teamId) {
    return json({ error: 'team not found' }, 400);
  }

  const termType = body.term_type ? String(body.term_type) : 'short_term';
  if (!ALLOWED_TERMS.has(termType)) {
    return json({ error: `term_type must be one of ${Array.from(ALLOWED_TERMS).join(', ')}` }, 400);
  }

  let type: string | null = null;
  if (body.type) {
    type = String(body.type);
    if (!ALLOWED_ISSUE_TYPES.has(type)) {
      return json({ error: `type must be one of ${Array.from(ALLOWED_ISSUE_TYPES).join(', ')}` }, 400);
    }
  }

  let priority: number | null = null;
  if (body.priority !== undefined) {
    const n = Number(body.priority);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return json({ error: 'priority must be an integer 1..5' }, 400);
    }
    priority = n;
  }

  let data: any;
  try {
    const rows = await sql`
      insert into issues (title, description, owner_employee_id, team_id, term_type, type, priority, status)
      values (${title}, ${body.description ? String(body.description) : null}, ${ownerId}, ${teamId},
              ${termType}, ${type}, ${priority ?? 3}, ${'open'})
      returning id`;
    data = rows[0];
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: data.id }, 201);
};

// ============================================================
// PATCH /api/v1/issues — mark an issue solved
// body: { id (required), solved?: boolean (default true) }
// Only toggles status between 'open' and 'solved'. No other mutations.
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const id = body?.id ? String(body.id) : '';
  if (!id) return json({ error: 'id is required' }, 400);
  const solved = body.solved === undefined ? true : Boolean(body.solved);
  const status = solved ? 'solved' : 'open';

  try {
    await sql`update issues set status = ${status} where id = ${id}`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  return json({ id, status });
};
