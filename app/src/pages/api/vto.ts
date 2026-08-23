import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { canEditVto } from '~/lib/permissions';

// V/TO is a singleton row. Every update targets the first (and only) row.
// The payload is { section, path, data } where `section` is 'vision' | 'traction' | 'swot'
// and `path` is a dotted key inside that section, e.g. 'core_values' or 'three_year.revenue.budget'.

const SECTIONS = new Set(['vision', 'traction', 'swot']);

async function getVtoId() {
  const rows = await sql`select id from vtos limit 1`;
  if (rows[0]) return rows[0].id;
  const inserted = await sql`insert into vtos default values returning id`;
  return inserted[0].id;
}

function setByPath(obj: Record<string, any>, path: string, value: any) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null) cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canEditVto(locals.user?.email)) return new Response('Forbidden', { status: 403 });
  const body = await request.json();
  const { section, path, data } = body ?? {};
  if (!SECTIONS.has(section)) return new Response('bad section', { status: 400 });

  const id = await getVtoId();

  // Fetch current section, patch it, write it back.
  let current: any;
  try {
    const rows = await sql`select ${sql.identifier(section)} from vtos where id = ${id}`;
    current = rows[0];
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  const sectionObj: Record<string, any> = { ...((current as any)[section] ?? {}) };
  if (!path) {
    // Replace the whole section.
    try {
      await sql`update vtos set ${sql.identifier(section)} = ${JSON.stringify(data ?? {})}::jsonb where id = ${id}`;
    } catch (e) {
      return new Response((e as Error).message, { status: 500 });
    }
    return new Response(null, { status: 204 });
  }

  setByPath(sectionObj, path, data);
  try {
    await sql`update vtos set ${sql.identifier(section)} = ${JSON.stringify(sectionObj)}::jsonb where id = ${id}`;
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
