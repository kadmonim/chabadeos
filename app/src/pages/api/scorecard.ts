import type { APIRoute } from 'astro';
import { sql, pool } from '~/lib/db';
import { canAccessTeam } from '~/lib/team';

// PUT /api/scorecard — upsert a weekly or monthly value (+ optional note)
export const PUT: APIRoute = async ({ request, locals }) => {
  const { measurable_id, date, value, note, frequency } = await request.json();
  if (!measurable_id || !date || !frequency) return new Response('bad input', { status: 400 });

  // Verify caller has access to the measurable's team.
  const mRows = await sql`select team_id from measurables where id = ${measurable_id}`;
  const m = mRows[0] ?? null;
  if (!m) return new Response('not found', { status: 404 });
  if (!canAccessTeam(locals, m.team_id)) return new Response('Forbidden', { status: 403 });

  const table = frequency === 'monthly' ? 'monthly_values' : 'weekly_values';
  const dateCol = frequency === 'monthly' ? 'month_start_date' : 'week_start_date';
  const parsedValue = value === '' || value == null ? null : Number(value);
  const trimmedNote = typeof note === 'string' ? note.trim() : null;
  const cleanNote = trimmedNote ? trimmedNote : null;

  // Delete only if both value and note are empty.
  if (parsedValue === null && cleanNote === null) {
    try {
      await pool.query(`delete from ${table} where measurable_id = $1 and ${dateCol} = $2`, [measurable_id, date]);
    } catch (e) {
      return new Response((e as Error).message, { status: 500 });
    }
    return new Response(null, { status: 204 });
  }

  try {
    await pool.query(
      `insert into ${table} (measurable_id, ${dateCol}, value, note) values ($1, $2, $3, $4)
       on conflict (measurable_id, ${dateCol}) do update set value = excluded.value, note = excluded.note`,
      [measurable_id, date, parsedValue, cleanNote],
    );
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
