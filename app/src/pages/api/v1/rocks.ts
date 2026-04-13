import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const includeArchived = url.searchParams.get('include_archived') === '1';

  let q = supabase
    .from('rocks')
    .select(`
      id, title, description, status, due_date, priority_order, is_archived, created_at,
      owner:employees!rocks_owner_employee_id_fkey(id, full_name, email),
      milestones(
        id, title, description, status, due_date, priority_order, is_archived, team_id, rock_id,
        owner:employees!milestones_owner_employee_id_fkey(id, full_name, email),
        team:teams(id, name)
      )
    `)
    .order('priority_order');
  if (!includeArchived) q = q.eq('is_archived', false);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const rocks = (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    due_date: r.due_date,
    priority_order: r.priority_order,
    is_archived: r.is_archived,
    created_at: r.created_at,
    owner: r.owner ? { id: r.owner.id, name: r.owner.full_name, email: r.owner.email } : null,
    milestones: (r.milestones ?? [])
      .sort((a: any, b: any) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        status: m.status,
        due_date: m.due_date,
        priority_order: m.priority_order,
        is_archived: m.is_archived,
        team: m.team ? { id: m.team.id, name: m.team.name } : null,
        owner: m.owner ? { id: m.owner.id, name: m.owner.full_name, email: m.owner.email } : null,
      })),
  }));

  return json({ rocks, count: rocks.length });
};
