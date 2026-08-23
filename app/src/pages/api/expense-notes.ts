import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canMutateExpenses } from '~/lib/permissions';

type NoteRow = {
  id: string;
  expense_id: number;
  author_employee_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
};

function shapeNote(n: NoteRow) {
  const a = Array.isArray(n.author) ? n.author[0] : n.author;
  return {
    id: n.id,
    expense_id: n.expense_id,
    author_employee_id: n.author_employee_id,
    author_name: a?.full_name ?? null,
    body: n.body,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

// GET /api/expense-notes?expense_id=123
//     /api/expense-notes?expense_ids=1,2,3   (comma-separated, for vendor rollups)
export const GET: APIRoute = async ({ url, locals }) => {
  const singleRaw = url.searchParams.get('expense_id');
  const multiRaw = url.searchParams.get('expense_ids');
  let ids: number[] = [];
  if (multiRaw) {
    ids = multiRaw.split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v));
  } else if (singleRaw != null) {
    const n = Number(singleRaw);
    if (Number.isInteger(n)) ids = [n];
  }
  if (ids.length === 0) return new Response('expense_id or expense_ids required', { status: 400 });
  if (!(await canMutateExpenses(locals, ids))) return new Response('Forbidden', { status: 403 });

  let data;
  try {
    data = await sql`
      select n.id, n.expense_id, n.author_employee_id, n.body, n.created_at, n.updated_at,
        case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name) end as author
      from expense_notes n
      left join employees e on e.id = n.author_employee_id
      where n.expense_id = any(${ids})
      order by n.created_at asc`;
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  return new Response(JSON.stringify({ notes: (data as NoteRow[]).map(shapeNote) }), {
    headers: { 'content-type': 'application/json' },
  });
};

// POST /api/expense-notes  { expense_id, body }
export const POST: APIRoute = async ({ request, locals }) => {
  const authorId = locals.user?.employeeId;
  if (!authorId) return new Response('No session', { status: 401 });

  const payload = await request.json();
  const expenseId = Number(payload?.expense_id);
  const body = String(payload?.body ?? '').trim();
  if (!Number.isInteger(expenseId)) return new Response('expense_id required', { status: 400 });
  if (!body) return new Response('body required', { status: 400 });
  if (!(await canMutateExpenses(locals, [expenseId]))) return new Response('Forbidden', { status: 403 });

  let data;
  try {
    const rows = await sql`
      with n as (
        insert into expense_notes (expense_id, author_employee_id, body)
        values (${expenseId}, ${authorId}, ${body})
        returning id, expense_id, author_employee_id, body, created_at, updated_at
      )
      select n.id, n.expense_id, n.author_employee_id, n.body, n.created_at, n.updated_at,
        case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name) end as author
      from n
      left join employees e on e.id = n.author_employee_id`;
    data = rows[0];
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  return new Response(JSON.stringify({ note: shapeNote(data as NoteRow) }), {
    headers: { 'content-type': 'application/json' },
  });
};

// PATCH /api/expense-notes  { id, body }  — author only
export const PATCH: APIRoute = async ({ request, locals }) => {
  const authorId = locals.user?.employeeId;
  if (!authorId) return new Response('No session', { status: 401 });

  const payload = await request.json();
  const id = String(payload?.id ?? '');
  const body = String(payload?.body ?? '').trim();
  if (!id) return new Response('id required', { status: 400 });
  if (!body) return new Response('body required', { status: 400 });

  const existingRows = await sql`select author_employee_id from expense_notes where id = ${id}`;
  const existing = existingRows[0] ?? null;
  if (!existing) return new Response('Not found', { status: 404 });
  if (existing.author_employee_id !== authorId) return new Response('Forbidden', { status: 403 });

  try {
    await sql`update expense_notes set body = ${body} where id = ${id}`;
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};

// DELETE /api/expense-notes?id=xxx  — author only
export const DELETE: APIRoute = async ({ url, locals }) => {
  const authorId = locals.user?.employeeId;
  if (!authorId) return new Response('No session', { status: 401 });

  const id = url.searchParams.get('id');
  if (!id) return new Response('id required', { status: 400 });

  const existingRows = await sql`select author_employee_id from expense_notes where id = ${id}`;
  const existing = existingRows[0] ?? null;
  if (!existing) return new Response('Not found', { status: 404 });
  if (existing.author_employee_id !== authorId) return new Response('Forbidden', { status: 403 });

  try {
    await sql`delete from expense_notes where id = ${id}`;
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
