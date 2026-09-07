// Static tags and per-contact tag assignment. Tag CRUD is admin-only;
// attaching/detaching a tag on a contact just needs the contact to be visible.
import { pool } from '../db';
import { visibilityClause } from './access';
import { TAG_COLORS } from './types';
import type { Viewer, Tag, TagColor } from './types';

function requireAdmin(viewer: Viewer): void {
  if (viewer.role !== 'admin') throw new Error('אין הרשאה');
}

function normalizeColor(color: string | undefined): TagColor {
  return (TAG_COLORS as readonly string[]).includes(color ?? '') ? (color as TagColor) : 'stone';
}

async function isContactVisible(viewer: Viewer, contactId: string): Promise<boolean> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select 1 from crm_contacts c where c.id = $1 and ${vis}`, params);
  return !!rows.rows[0];
}

/** All tags with their live contact count. */
export async function listTags(): Promise<Tag[]> {
  const rows = await pool.query(
    `select t.id, t.name, t.color, count(ct.contact_id)::int as contact_count
     from crm_tags t left join crm_contact_tags ct on ct.tag_id = t.id
     group by t.id
     order by lower(t.name)`,
  );
  return rows.rows as Tag[];
}

/** Create a tag; admin only. Name is trimmed and unique case-insensitively. */
export async function createTag(viewer: Viewer, name: string, color?: string): Promise<{ id: string }> {
  requireAdmin(viewer);
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('שם תגית חסר');

  const dupe = await pool.query(`select 1 from crm_tags where name ilike $1`, [trimmed]);
  if (dupe.rows[0]) throw new Error('תגית בשם זה כבר קיימת');

  const rows = await pool.query(
    `insert into crm_tags (name, color) values ($1, $2) returning id`,
    [trimmed, normalizeColor(color)],
  );
  return { id: rows.rows[0].id as string };
}

/** Update a tag's name/color; admin only. */
export async function updateTag(viewer: Viewer, id: string, input: { name?: string; color?: string }): Promise<boolean> {
  requireAdmin(viewer);
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('שם תגית חסר');
    const dupe = await pool.query(`select 1 from crm_tags where name ilike $1 and id <> $2`, [trimmed, id]);
    if (dupe.rows[0]) throw new Error('תגית בשם זה כבר קיימת');
    sets.push(`name = $${params.push(trimmed)}`);
  }
  if (input.color !== undefined) {
    sets.push(`color = $${params.push(normalizeColor(input.color))}`);
  }
  if (!sets.length) return true;

  const idIdx = params.push(id);
  const result = await pool.query(`update crm_tags set ${sets.join(', ')} where id = $${idIdx}`, params);
  return (result.rowCount ?? 0) > 0;
}

/** Delete a tag (and its contact assignments); admin only. */
export async function deleteTag(viewer: Viewer, id: string): Promise<boolean> {
  requireAdmin(viewer);
  const result = await pool.query(`delete from crm_tags where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/** Replace a contact's tag list. */
export async function setContactTags(viewer: Viewer, contactId: string, tagIds: string[]): Promise<boolean> {
  if (!(await isContactVisible(viewer, contactId))) return false;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from crm_contact_tags where contact_id = $1', [contactId]);
    for (const tagId of tagIds) {
      await client.query(
        `insert into crm_contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing`,
        [contactId, tagId],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return true;
}

/** Attach one tag to a contact. */
export async function addContactTag(viewer: Viewer, contactId: string, tagId: string): Promise<boolean> {
  if (!(await isContactVisible(viewer, contactId))) return false;
  await pool.query(
    `insert into crm_contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing`,
    [contactId, tagId],
  );
  return true;
}

/** Detach one tag from a contact. */
export async function removeContactTag(viewer: Viewer, contactId: string, tagId: string): Promise<boolean> {
  if (!(await isContactVisible(viewer, contactId))) return false;
  await pool.query(`delete from crm_contact_tags where contact_id = $1 and tag_id = $2`, [contactId, tagId]);
  return true;
}
