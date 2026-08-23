import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

async function resolveTeam(teamId: string | null, teamName: string | null): Promise<string | null> {
  if (teamId) return teamId;
  if (!teamName) return null;
  const rows = await sql`select id from teams where name ilike ${teamName}`;
  return (rows[0] as any)?.id ?? null;
}

// ============================================================
// GET /api/v1/issues/:id/shares
// Returns the list of teams this issue is shared with.
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { id } = params;

  const issueRows = await sql`select id from issues where id = ${id!}`;
  const issue = issueRows[0] ?? null;
  if (!issue) return json({ error: 'issue not found' }, 404);

  let data: any[];
  try {
    data = await sql`
      select case when t.id is null then null
                  else json_build_object('id', t.id, 'name', t.name) end as team
      from issue_shares s
      left join teams t on t.id = s.team_id
      where s.issue_id = ${id!}`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const teams = (data ?? []).map((s: any) => s.team).filter(Boolean);
  return json({ issue_id: id, shared_with: teams });
};

// ============================================================
// POST /api/v1/issues/:id/shares
// Share the issue with a team.
// body: { team_id? or team_name? }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const teamId = await resolveTeam(
    body.team_id ? String(body.team_id) : null,
    body.team_name ? String(body.team_name) : null,
  );
  if (!teamId) return json({ error: 'team_id or team_name is required and must match an existing team' }, 400);

  const issueRows = await sql`select id, team_id from issues where id = ${id!}`;
  const issue = (issueRows[0] as any) ?? null;
  if (!issue) return json({ error: 'issue not found' }, 404);
  if (issue.team_id === teamId) return json({ error: 'cannot share an issue with its own team' }, 400);

  try {
    await sql`insert into issue_shares (issue_id, team_id) values (${id!}, ${teamId})`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ issue_id: id, team_id: teamId }, 201);
};

// ============================================================
// DELETE /api/v1/issues/:id/shares
// Remove a team from the issue's shares.
// body: { team_id? or team_name? }
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const teamId = await resolveTeam(
    body.team_id ? String(body.team_id) : null,
    body.team_name ? String(body.team_name) : null,
  );
  if (!teamId) return json({ error: 'team_id or team_name is required and must match an existing team' }, 400);

  try {
    await sql`delete from issue_shares where issue_id = ${id!} and team_id = ${teamId}`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return new Response(null, { status: 204 });
};
