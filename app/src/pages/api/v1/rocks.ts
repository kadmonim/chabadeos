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
             else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner
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
  }));

  return json({ rocks, count: rocks.length });
};
