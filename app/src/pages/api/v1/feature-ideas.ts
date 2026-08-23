import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const rows = await sql`select id from employees where email ilike ${email}`;
  return (rows[0] as any)?.id ?? null;
}

// ============================================================
// GET /api/v1/feature-ideas
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const ownerEmail = url.searchParams.get('assignee') ?? url.searchParams.get('owner');
  const status = url.searchParams.get('status') ?? 'open';
  const term = url.searchParams.get('term');
  const tag = url.searchParams.get('tag');

  let ownerId: string | null = null;
  if (ownerEmail) {
    ownerId = await resolveEmployeeByEmail(ownerEmail);
    if (!ownerId) return json({ feature_ideas: [], count: 0, note: `no employee with email '${ownerEmail}'` });
  }

  const wheres: string[] = [];
  const vals: unknown[] = [];
  if (ownerId) {
    vals.push(ownerId);
    wheres.push(`fi.owner_employee_id = $${vals.length}`);
  }
  if (status !== 'all') {
    vals.push(status);
    wheres.push(`fi.status = $${vals.length}`);
  }
  if (term) {
    vals.push(term);
    wheres.push(`fi.term_type = $${vals.length}`);
  }
  if (tag) {
    vals.push([tag]);
    wheres.push(`fi.tags @> $${vals.length}`);
  }

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        fi.id, fi.title, fi.description, fi.status, fi.priority, fi.priority_order,
        fi.term_type, fi.tags, fi.created_at, fi.updated_at,
        case when o.id is null then null
             else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner
      from feature_ideas fi
      left join employees o on o.id = fi.owner_employee_id
      ${wheres.length ? `where ${wheres.join(' and ')}` : ''}
      order by fi.priority_order asc`,
      vals,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const feature_ideas = (data ?? []).map((i: any) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    status: i.status,
    priority: i.priority,
    priority_order: i.priority_order,
    term_type: i.term_type,
    tags: i.tags,
    created_at: i.created_at,
    updated_at: i.updated_at,
    owner: i.owner ? { id: i.owner.id, name: i.owner.full_name, email: i.owner.email } : null,
  }));

  return json({ feature_ideas, count: feature_ideas.length });
};

// ============================================================
// POST /api/v1/feature-ideas — create a new feature idea
// body: { title (required), description?, owner_email?,
//         term_type? ('short_term' | 'long_term' | 'idea_backlog'),
//         priority? (1-5), tags? (string[]) }
// ============================================================
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

  const termType = body.term_type ? String(body.term_type) : 'short_term';
  if (!ALLOWED_TERMS.has(termType)) {
    return json({ error: `term_type must be one of ${Array.from(ALLOWED_TERMS).join(', ')}` }, 400);
  }

  let priority: number | null = null;
  if (body.priority !== undefined) {
    const n = Number(body.priority);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return json({ error: 'priority must be an integer 1..5' }, 400);
    }
    priority = n;
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
    : [];

  let data: any;
  try {
    const rows = await sql`
      insert into feature_ideas (title, description, owner_employee_id, term_type, priority, tags, status)
      values (${title}, ${body.description ? String(body.description) : null}, ${ownerId},
              ${termType}, ${priority ?? 3}, ${tags}, ${'open'})
      returning id`;
    data = rows[0];
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: data.id }, 201);
};

// ============================================================
// PATCH /api/v1/feature-ideas — update a feature idea
// body: { id (required), solved?: boolean, status?, tags? }
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const id = body?.id ? String(body.id) : '';
  if (!id) return json({ error: 'id is required' }, 400);

  const patch: Record<string, unknown> = {};
  if (body.solved !== undefined) patch.status = body.solved ? 'solved' : 'open';
  if (body.status) patch.status = String(body.status);
  if (Array.isArray(body.tags)) patch.tags = body.tags.map((t: any) => String(t).trim()).filter(Boolean);

  if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.status !== undefined) { vals.push(patch.status); sets.push(`status = $${vals.length}`); }
  if (patch.tags !== undefined) { vals.push(patch.tags); sets.push(`tags = $${vals.length}`); }
  vals.push(id);

  try {
    await pool.query(`update feature_ideas set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  return json({ id, ...patch });
};
