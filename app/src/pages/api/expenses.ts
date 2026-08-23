import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canMutateExpenses } from '~/lib/permissions';

const ALLOWED_STATUSES = new Set(['none', 'good', 'to_review', 'cancelled', 'to_move']);

// PATCH /api/expenses
//   single: { id, status, move_to_method? }
//   bulk:   { ids: [...], status, move_to_method? }
// move_to_method is kept when status='to_move' and cleared on any other status.
export const PATCH: APIRoute = async ({ request, locals }) => {
  const body = await request.json();
  const { id, ids, status, move_to_method } = body ?? {};

  if (!ALLOWED_STATUSES.has(status)) return new Response('bad status', { status: 400 });

  let moveToMethod: string | null = null;
  if (status === 'to_move') {
    if (typeof move_to_method !== 'string' || !move_to_method.trim()) {
      return new Response('move_to_method required when status=to_move', { status: 400 });
    }
    moveToMethod = move_to_method.trim();
  }

  if (Array.isArray(ids) && ids.length > 0) {
    const cleanIds = ids.filter((v) => Number.isInteger(v));
    if (cleanIds.length === 0) return new Response('no valid ids', { status: 400 });
    if (!(await canMutateExpenses(locals, cleanIds))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`update expenses set status = ${status}, move_to_method = ${moveToMethod} where expense_id = any(${cleanIds})`;
    } catch (e) {
      return new Response((e as Error).message, { status: 500 });
    }
    return new Response(null, { status: 204 });
  }

  if (id != null) {
    const numId = Number(id);
    if (!Number.isInteger(numId)) return new Response('bad id', { status: 400 });
    if (!(await canMutateExpenses(locals, [numId]))) return new Response('Forbidden', { status: 403 });
    try {
      await sql`update expenses set status = ${status}, move_to_method = ${moveToMethod} where expense_id = ${numId}`;
    } catch (e) {
      return new Response((e as Error).message, { status: 500 });
    }
    return new Response(null, { status: 204 });
  }

  return new Response('id or ids required', { status: 400 });
};
