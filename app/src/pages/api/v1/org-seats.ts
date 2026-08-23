import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

type SeatRow = {
  id: string;
  parent_id: string | null;
  title: string;
  person_name: string | null;
  employee_id: string | null;
  employee_full_name: string | null;
  employee_email: string | null;
  responsibilities: string[];
  display_order: number;
};

async function allSeats(): Promise<SeatRow[]> {
  const rows = await sql`
    select s.id, s.parent_id, s.title, s.person_name, s.employee_id,
           e.full_name as employee_full_name, e.email as employee_email,
           s.responsibilities, s.display_order
    from org_seats s
    left join employees e on e.id = s.employee_id
    order by s.display_order asc, s.title asc`;
  return rows as SeatRow[];
}

function shape(s: SeatRow) {
  return {
    id: s.id,
    parent_id: s.parent_id,
    title: s.title,
    // A seat's occupant is either a linked employee or a free-text name.
    person: s.employee_id
      ? { id: s.employee_id, name: s.employee_full_name, email: s.employee_email }
      : (s.person_name ? { id: null, name: s.person_name, email: null } : null),
    responsibilities: s.responsibilities ?? [],
    display_order: s.display_order,
  };
}

// Seats are addressable by id or by exact title, so callers don't need ids.
async function resolveSeat(idOrTitle: string): Promise<{ id: string; title: string } | null> {
  const rows = await sql`
    select id, title from org_seats where id = ${idOrTitle} or title ilike ${idOrTitle} limit 1`;
  return (rows[0] as any) ?? null;
}

function parseResponsibilities(value: unknown): string[] | null {
  if (value === null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split('\n').map((s) => s.trim()).filter(Boolean);
  return null;
}

// ============================================================
// GET /api/v1/org-seats — the org chart
// ?flat=1 returns a flat list instead of a nested tree.
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let rows: SeatRow[];
  try {
    rows = await allSeats();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  if (url.searchParams.get('flat') === '1') {
    const seats = rows.map(shape);
    return json({ seats, count: seats.length });
  }

  const nodes = new Map(rows.map((r) => [r.id, { ...shape(r), reports: [] as unknown[] }]));
  const roots: unknown[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parent_id ? nodes.get(r.parent_id) : null;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }

  return json({ seats: roots, count: rows.length });
};

// ============================================================
// POST /api/v1/org-seats — create a seat
// body: { title (required), parent_id? | parent_title?, employee_email?,
//         person_name?, responsibilities? (string[] or newline string),
//         display_order? }
// Omitting the parent creates a top-level seat.
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return json({ error: 'title is required' }, 400);

  let parentId: string | null = null;
  if (body.parent_id || body.parent_title) {
    const parent = await resolveSeat(String(body.parent_id || body.parent_title));
    if (!parent) return json({ error: 'parent seat not found' }, 400);
    parentId = parent.id;
  }

  let employeeId: string | null = null;
  if (body.employee_email) {
    const rows = await sql`select id from employees where email ilike ${String(body.employee_email)}`;
    employeeId = (rows[0] as any)?.id ?? null;
    if (!employeeId) return json({ error: `no employee with email '${body.employee_email}'` }, 400);
  }

  const responsibilities = parseResponsibilities(body.responsibilities ?? []);
  if (responsibilities === null) {
    return json({ error: 'responsibilities must be an array of strings' }, 400);
  }

  let id: string;
  try {
    const rows = await sql`
      insert into org_seats (title, parent_id, employee_id, person_name, responsibilities, display_order)
      values (${title}, ${parentId}, ${employeeId},
              ${body.person_name ? String(body.person_name) : null},
              ${JSON.stringify(responsibilities)}::jsonb,
              ${Number.isInteger(body.display_order) ? body.display_order : 0})
      returning id`;
    id = (rows[0] as any).id;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id, title, parent_id: parentId }, 201);
};

// ============================================================
// PATCH /api/v1/org-seats — update or move a seat
// body: { id? | title? (to identify), new_title?, parent_id? | parent_title?,
//         employee_email?, person_name?, responsibilities?, display_order? }
//   - parent_id/parent_title: null moves the seat to the top level
//   - employee_email / person_name: pass null or '' to clear
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const key = body?.id ? String(body.id) : (body?.title ? String(body.title) : '');
  if (!key) return json({ error: 'id or title is required' }, 400);
  const seat = await resolveSeat(key);
  if (!seat) return json({ error: 'seat not found' }, 404);

  const sets: string[] = [];
  const vals: unknown[] = [];
  const applied: Record<string, unknown> = {};
  const set = (col: string, value: unknown) => {
    vals.push(value);
    sets.push(`${col} = $${vals.length}`);
    applied[col] = value;
  };

  if (body.new_title !== undefined) {
    const newTitle = String(body.new_title).trim();
    if (!newTitle) return json({ error: 'new_title cannot be empty' }, 400);
    set('title', newTitle);
  }

  if (body.parent_id !== undefined || body.parent_title !== undefined) {
    const raw = body.parent_id ?? body.parent_title;
    if (!raw) {
      set('parent_id', null);
    } else {
      const parent = await resolveSeat(String(raw));
      if (!parent) return json({ error: 'parent seat not found' }, 400);
      if (parent.id === seat.id) return json({ error: 'a seat cannot report to itself' }, 400);
      // Reparenting into your own subtree would detach that branch from the
      // chart entirely, so walk up from the new parent and refuse a cycle.
      const rows = await allSeats();
      const parentOf = new Map(rows.map((r) => [r.id, r.parent_id]));
      let cursor = parentOf.get(parent.id) ?? null;
      while (cursor) {
        if (cursor === seat.id) {
          return json({ error: `'${parent.title}' reports to '${seat.title}' — that move would create a loop` }, 400);
        }
        cursor = parentOf.get(cursor) ?? null;
      }
      set('parent_id', parent.id);
    }
  }

  if (body.employee_email !== undefined) {
    if (!body.employee_email) {
      set('employee_id', null);
    } else {
      const rows = await sql`select id from employees where email ilike ${String(body.employee_email)}`;
      const employeeId = (rows[0] as any)?.id ?? null;
      if (!employeeId) return json({ error: `no employee with email '${body.employee_email}'` }, 400);
      set('employee_id', employeeId);
    }
  }

  if (body.person_name !== undefined) {
    set('person_name', body.person_name ? String(body.person_name) : null);
  }

  if (body.responsibilities !== undefined) {
    const responsibilities = parseResponsibilities(body.responsibilities);
    if (responsibilities === null) {
      return json({ error: 'responsibilities must be an array of strings' }, 400);
    }
    vals.push(JSON.stringify(responsibilities));
    sets.push(`responsibilities = $${vals.length}::jsonb`);
    applied.responsibilities = responsibilities;
  }

  if (body.display_order !== undefined) {
    if (!Number.isInteger(body.display_order)) {
      return json({ error: 'display_order must be an integer' }, 400);
    }
    set('display_order', body.display_order);
  }

  if (sets.length === 0) return json({ error: 'no updatable fields provided' }, 400);

  vals.push(seat.id);
  try {
    await pool.query(`update org_seats set ${sets.join(', ')} where id = $${vals.length}`, vals);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ id: seat.id, ...applied });
};

// ============================================================
// DELETE /api/v1/org-seats — remove a seat
// body: { id? | title?, cascade? }
// Deleting a seat deletes everything under it, so a seat with reports is
// refused unless cascade is true.
// ============================================================
export const DELETE: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const key = body?.id ? String(body.id) : (body?.title ? String(body.title) : '');
  if (!key) return json({ error: 'id or title is required' }, 400);
  const seat = await resolveSeat(key);
  if (!seat) return json({ error: 'seat not found' }, 404);

  const rows = await allSeats();
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r.id]);
  }
  const descendants: string[] = [];
  const queue = [...(children.get(seat.id) ?? [])];
  while (queue.length) {
    const next = queue.shift()!;
    descendants.push(next);
    queue.push(...(children.get(next) ?? []));
  }

  if (descendants.length > 0 && body.cascade !== true) {
    return json({
      error: `'${seat.title}' has ${descendants.length} seat(s) beneath it, which would be deleted too — resend with "cascade": true`,
      descendant_count: descendants.length,
    }, 409);
  }

  try {
    await sql`delete from org_seats where id = ${seat.id}`;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ deleted: seat.id, title: seat.title, also_deleted: descendants.length });
};
