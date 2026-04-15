import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

async function resolveTeam(teamId: string | null, teamName: string | null): Promise<string | null> {
  if (teamId) return teamId;
  if (!teamName) return null;
  const { data } = await supabase.from('teams').select('id').ilike('name', teamName).maybeSingle();
  return data?.id ?? null;
}

// ============================================================
// GET /api/v1/issues/:id/shares
// Returns the list of teams this issue is shared with.
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { id } = params;

  const { data: issue } = await supabase.from('issues').select('id').eq('id', id!).maybeSingle();
  if (!issue) return json({ error: 'issue not found' }, 404);

  const { data, error } = await supabase
    .from('issue_shares')
    .select('team:teams(id, name)')
    .eq('issue_id', id!);
  if (error) return json({ error: error.message }, 500);

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

  const { data: issue } = await supabase.from('issues').select('id, team_id').eq('id', id!).maybeSingle();
  if (!issue) return json({ error: 'issue not found' }, 404);
  if (issue.team_id === teamId) return json({ error: 'cannot share an issue with its own team' }, 400);

  const { error } = await supabase.from('issue_shares').upsert({ issue_id: id!, team_id: teamId });
  if (error) return json({ error: error.message }, 500);

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

  const { error } = await supabase
    .from('issue_shares')
    .delete()
    .eq('issue_id', id!)
    .eq('team_id', teamId);
  if (error) return json({ error: error.message }, 500);

  return new Response(null, { status: 204 });
};
