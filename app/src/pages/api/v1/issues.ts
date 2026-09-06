import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveTeamRef, resolveEmployeeByEmail } from '~/lib/api-lookup';

// ============================================================
// GET /api/v1/issues
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const ownerEmail = url.searchParams.get('assignee') ?? url.searchParams.get('owner');
  const teamRef = url.searchParams.get('team_id') ?? url.searchParams.get('team');
  const status = url.searchParams.get('status') ?? 'open';
  const term = url.searchParams.get('term');

  let ownerId: string | null = null;
  if (ownerEmail) {
    ownerId = await resolveEmployeeByEmail(ownerEmail);
    if (!ownerId) return json({ issues: [], count: 0, note: `no employee with email '${ownerEmail}'` });
  }

  let teamId: string | null = null;
  if (teamRef) {
    teamId = await resolveTeamRef(teamRef);
    if (!teamId) return json({ issues: [], count: 0, note: `no team matching '${teamRef}'` });
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

  const teamId = await resolveTeamRef(
    body.team_id ? String(body.team_id) : (body.team_name ? String(body.team_name) : null),
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
// PATCH /api/v1/issues — update an issue
// body: { id (required), solved?, status?, title?, description?,
//         team_id? | team_name?, owner_email?, term_type?, type?, priority? }
// With only { id }, the issue is marked solved (the historical behaviour).
// Reassigning team_id moves the issue and keeps its id, history and shares.
// ============================================================
const ALLOWED_STATUSES = new Set(['open', 'solved', 'archived']);

export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const id = body?.id ? String(body.id) : '';
  if (!id) return json({ error: 'id is required' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const applied: Record<string, unknown> = {};
  const set = (col: string, value: unknown) => {
    vals.push(value);
    sets.push(`${col} = $${vals.length}`);
    applied[col] = value;
  };

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!ALLOWED_STATUSES.has(status)) {
      return json({ error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` }, 400);
    }
    set('status', status);
  } else if (body.solved !== undefined) {
    set('status', Boolean(body.solved) ? 'solved' : 'open');
  }

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return json({ error: 'title cannot be empty' }, 400);
    set('title', title);
  }

  if (body.description !== undefined) {
    set('description', body.description ? String(body.description) : null);
  }

  if (body.team_id !== undefined || body.team_name !== undefined) {
    const raw = body.team_id ?? body.team_name;
    if (!raw) {
      set('team_id', null);
    } else {
      const teamId = await resolveTeamRef(String(raw));
      if (!teamId) return json({ error: `no team matching '${raw}'` }, 400);
      set('team_id', teamId);
    }
  }

  if (body.owner_email !== undefined) {
    if (!body.owner_email) {
      set('owner_employee_id', null);
    } else {
      const ownerId = await resolveEmployeeByEmail(String(body.owner_email));
      if (!ownerId) return json({ error: `no employee with email '${body.owner_email}'` }, 400);
      set('owner_employee_id', ownerId);
    }
  }

  if (body.term_type !== undefined) {
    const termType = String(body.term_type);
    if (!ALLOWED_TERMS.has(termType)) {
      return json({ error: `term_type must be one of ${Array.from(ALLOWED_TERMS).join(', ')}` }, 400);
    }
    set('term_type', termType);
  }

  if (body.type !== undefined) {
    if (!body.type) {
      set('type', null);
    } else {
      const type = String(body.type);
      if (!ALLOWED_ISSUE_TYPES.has(type)) {
        return json({ error: `type must be one of ${Array.from(ALLOWED_ISSUE_TYPES).join(', ')}` }, 400);
      }
      set('type', type);
    }
  }

  if (body.priority !== undefined) {
    const n = Number(body.priority);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return json({ error: 'priority must be an integer 1..5' }, 400);
    }
    set('priority', n);
  }

  // Bare { id } keeps meaning "mark this solved".
  if (sets.length === 0) set('status', 'solved');

  vals.push(id);
  let result: any;
  try {
    result = await pool.query(
      `update issues set ${sets.join(', ')} where id = $${vals.length} returning id`,
      vals,
    );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (result.rowCount === 0) return json({ error: `no issue with id '${id}'` }, 404);

  return json({ id, ...applied });
};
