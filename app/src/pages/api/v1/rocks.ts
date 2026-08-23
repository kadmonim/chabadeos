import type { APIRoute } from 'astro';
import { pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const includeArchived = url.searchParams.get('include_archived') === '1';

  let data: any[];
  try {
    ({ rows: data } = await pool.query(
      `select
        r.id, r.title, r.description, r.status, r.due_date, r.priority_order, r.is_archived, r.created_at,
        case when o.id is null then null
             else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner,
        coalesce((
          select json_agg(json_build_object(
            'id', m.id, 'title', m.title, 'description', m.description, 'status', m.status,
            'due_date', m.due_date, 'priority_order', m.priority_order, 'is_archived', m.is_archived,
            'team_id', m.team_id, 'rock_id', m.rock_id,
            'owner', case when mo.id is null then null
                          else json_build_object('id', mo.id, 'full_name', mo.full_name, 'email', mo.email) end,
            'team', case when mt.id is null then null
                         else json_build_object('id', mt.id, 'name', mt.name) end
          ))
          from milestones m
          left join employees mo on mo.id = m.owner_employee_id
          left join teams mt on mt.id = m.team_id
          where m.rock_id = r.id
        ), '[]'::json) as milestones
      from rocks r
      left join employees o on o.id = r.owner_employee_id
      ${includeArchived ? '' : 'where r.is_archived = false'}
      order by r.priority_order asc`,
    ));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

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
