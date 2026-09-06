import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let data: any;
  try {
    const rows = await sql`select id, vision, traction, swot, updated_at from vtos limit 1`;
    data = rows[0] ?? null;
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!data) return json({ vto: null });

  return json({
    vto: {
      id: data.id,
      updated_at: data.updated_at,
      vision: data.vision ?? {},
      traction: data.traction ?? {},
      swot: data.swot ?? {},
    },
  });
};
