import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

async function assertIssueTeamAccess(id: string, locals: App.Locals) {
  const rows = await sql`select team_id from issues where id = ${id}`;
  const data = rows[0] ?? null;
  return canAccessTeam(locals, data?.team_id);
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/issues');

  if (action === 'archive_solved') {
    const team_id = String(form.get('team_id') ?? '') || null;
    const term_type = String(form.get('term_type') ?? '') || null;
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    const vals: unknown[] = [];
    let where = `status = 'solved'`;
    if (team_id) {
      vals.push(team_id);
      where += ` and team_id = $${vals.length}`;
    }
    if (term_type) {
      vals.push(term_type);
      where += ` and term_type = $${vals.length}`;
    }
    try {
      await pool.query(`update issues set status = 'archived' where ${where}`, vals);
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'create') {
    const title = String(form.get('title') ?? '').trim();
    const team_id = String(form.get('team_id') ?? '') || null;
    const term_type = (String(form.get('term_type') ?? 'short_term')) as 'short_term' | 'long_term';
    const owner_employee_id = String(form.get('owner_employee_id') ?? '') || null;
    const description = String(form.get('description') ?? '') || null;
    const priorityRaw = form.get('priority');
    const priority = priorityRaw ? Number(priorityRaw) : 3;
    if (!title) return redirect(back);
    if (!canAccessTeam(locals, team_id)) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        insert into issues (title, team_id, term_type, owner_employee_id, status, priority, description)
        values (${title}, ${team_id}, ${term_type}, ${owner_employee_id}, ${'open'}, ${priority}, ${description})`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'update') {
    const id = String(form.get('id') ?? '');
    if (!id) return new Response('id required', { status: 400 });
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    const new_team_id = String(form.get('team_id') ?? '') || null;
    if (!canAccessTeam(locals, new_team_id)) return new Response('Forbidden', { status: 403 });
    const vals: unknown[] = [
      String(form.get('title') ?? '').trim(),
      String(form.get('description') ?? '') || null,
      new_team_id,
      String(form.get('owner_employee_id') ?? '') || null,
      Number(form.get('priority') ?? 3),
      String(form.get('term_type') ?? 'short_term'),
    ];
    let setClause = 'title = $1, description = $2, team_id = $3, owner_employee_id = $4, priority = $5, term_type = $6';
    const status = form.get('status');
    if (status) {
      vals.push(String(status));
      setClause += `, status = $${vals.length}`;
    }
    vals.push(id);
    try {
      await pool.query(`update issues set ${setClause} where id = $${vals.length}`, vals);
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'delete') {
    const id = String(form.get('id') ?? '');
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from issues where id = ${id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'share_team') {
    const id = String(form.get('id') ?? '');
    const share_team_id = String(form.get('share_team_id') ?? '');
    if (!id || !share_team_id) return new Response('id and share_team_id required', { status: 400 });
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`
        insert into issue_shares (issue_id, team_id) values (${id}, ${share_team_id})
        on conflict (id) do update set issue_id = excluded.issue_id, team_id = excluded.team_id`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  if (action === 'unshare_team') {
    const id = String(form.get('id') ?? '');
    const share_team_id = String(form.get('share_team_id') ?? '');
    if (!id || !share_team_id) return new Response('id and share_team_id required', { status: 400 });
    if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`delete from issue_shares where issue_id = ${id} and team_id = ${share_team_id}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return redirect(back);
  }

  return new Response('unknown action', { status: 400 });
};

// PUT /api/issues — reorder issues
// body: { ids: string[] } — ordered list of issue IDs
export const PUT: APIRoute = async ({ request, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return new Response('body must be JSON', { status: 400 }); }
  const ids: string[] = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return new Response('ids required', { status: 400 });

  const updates = ids.map((id, i) =>
    sql`update issues set priority_order = ${i} where id = ${id}`
  );
  const results = await Promise.allSettled(updates);
  const err = results.find((r) => r.status === 'rejected');
  if (err) return new Response(((err as PromiseRejectedResult).reason as Error).message, { status: 500 });
  return new Response(null, { status: 204 });
};

const ISSUE_PATCH_FIELDS = new Set(['status', 'description', 'title', 'priority', 'term_type']);

export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json();
  const { id, ...rest } = body ?? {};
  if (!id) return new Response('id required', { status: 400 });
  if (!(await assertIssueTeamAccess(id, locals))) return new Response('Forbidden', { status: 403 });
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (ISSUE_PATCH_FIELDS.has(k)) {
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return new Response('no valid fields', { status: 400 });
  vals.push(id);
  try {
    await pool.query(`update issues set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
