import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canAccessExpenses } from '~/lib/permissions';

// Parses a textarea with one value per line into a clean string array.
function parseLines(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

// GET /api/expenses-vendors            → { employees } (for the new-vendor form)
// GET /api/expenses-vendors?id=123      → { vendor, employees }
export const GET: APIRoute = async ({ url, locals }) => {
  if (!canAccessExpenses(locals)) return new Response('Forbidden', { status: 403 });
  const idRaw = url.searchParams.get('id');
  const employees = await sql`select id, full_name from employees order by full_name asc`;
  if (idRaw == null) {
    return new Response(JSON.stringify({ employees: employees ?? [] }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return new Response('bad id', { status: 400 });
  const vendorRows = await sql`
    select vendor_id, name, person_employee_id, description, frequency, status, group_name, latest_update, to_do, review_again, tags, aliases, report_matches
    from expenses_vendors
    where vendor_id = ${id}`;
  const vendor = vendorRows[0] ?? null;
  if (!vendor) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify({ vendor, employees: employees ?? [] }), {
    headers: { 'content-type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!canAccessExpenses(locals)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const action = String(form.get('_action') ?? 'create');
  const back = String(form.get('back') ?? '/expenses/vendors');
  const ajax = String(form.get('ajax') ?? '') === '1';
  const ok = () => (ajax ? new Response(null, { status: 204 }) : redirect(back));

  if (action === 'create') {
    const name = String(form.get('name') ?? '').trim();
    if (!name) return redirect(back);
    // If a vendor with this name already exists, route the user to its editor
    // instead of raising a unique-constraint error.
    const existingRows = await sql`select vendor_id from expenses_vendors where name ilike ${name}`;
    const existing = existingRows[0] ?? null;
    if (existing?.vendor_id) {
      return ajax
        ? new Response(JSON.stringify({ duplicate: true, vendor_id: existing.vendor_id }), { status: 200, headers: { 'content-type': 'application/json' } })
        : redirect(`/expenses/vendors?edit=${existing.vendor_id}`);
    }
    const reportMatches = parseLines(String(form.get('report_matches') ?? ''));
    try {
      await sql`
        insert into expenses_vendors (name, person_employee_id, description, frequency, status, group_name, latest_update, to_do, review_again, tags, aliases, report_matches)
        values (
          ${name},
          ${String(form.get('person_employee_id') ?? '') || null},
          ${String(form.get('description') ?? '') || null},
          ${String(form.get('frequency') ?? '') || null},
          ${String(form.get('status') ?? '') || 'Unknown'},
          ${String(form.get('group_name') ?? '') || 'Unknown'},
          ${String(form.get('latest_update') ?? '') || null},
          ${String(form.get('to_do') ?? '') || null},
          ${String(form.get('review_again') ?? '') || null},
          ${parseLines(String(form.get('tags') ?? ''))},
          ${parseLines(String(form.get('aliases') ?? ''))},
          ${reportMatches.length > 0 ? reportMatches : [name]}
        )`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return ok();
  }

  if (action === 'update') {
    const vendorId = Number(form.get('vendor_id'));
    if (!Number.isInteger(vendorId)) return new Response('vendor_id required', { status: 400 });
    try {
      await sql`
        update expenses_vendors set
          name = ${String(form.get('name') ?? '').trim()},
          person_employee_id = ${String(form.get('person_employee_id') ?? '') || null},
          description = ${String(form.get('description') ?? '') || null},
          frequency = ${String(form.get('frequency') ?? '') || null},
          status = ${String(form.get('status') ?? '') || 'Unknown'},
          group_name = ${String(form.get('group_name') ?? '') || 'Unknown'},
          latest_update = ${String(form.get('latest_update') ?? '') || null},
          to_do = ${String(form.get('to_do') ?? '') || null},
          review_again = ${String(form.get('review_again') ?? '') || null},
          tags = ${parseLines(String(form.get('tags') ?? ''))},
          aliases = ${parseLines(String(form.get('aliases') ?? ''))},
          report_matches = ${parseLines(String(form.get('report_matches') ?? ''))}
        where vendor_id = ${vendorId}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return ok();
  }

  if (action === 'delete') {
    const vendorId = Number(form.get('vendor_id'));
    try {
      await sql`delete from expenses_vendors where vendor_id = ${vendorId}`;
    } catch (e) {
      return new Response(`Error: ${(e as Error).message}`, { status: 500 });
    }
    return ok();
  }

  return new Response('unknown action', { status: 400 });
};
