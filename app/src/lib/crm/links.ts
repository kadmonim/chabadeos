// Typed links between contacts (spouse, parent/child, ...). Every read/write
// checks both endpoints against visibilityClause; the inverse label is
// computed in code (see LINK_INVERSE in types.ts), never stored twice.
import { pool } from '../db';
import { visibilityClause } from './access';
import { logSystemActivity } from './contacts';
import { LINK_TYPES, LINK_INVERSE } from './types';
import type { Viewer, LinkType, ContactDetail } from './types';

/** True when the contact is visible to the viewer (and exists, not archived). */
async function isVisible(viewer: Viewer, contactId: string): Promise<{ id: string; household_id: string | null } | null> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(
    `select c.id, c.household_id from crm_contacts c where c.id = $1 and not c.is_archived and ${vis}`,
    params,
  );
  return rows.rows[0] ?? null;
}

/**
 * Add a typed link between two contacts. Idempotent: an existing row for
 * (from, to, type) or its inverse (to, from, LINK_INVERSE[type]) is returned
 * as-is rather than duplicated.
 */
export async function addLink(
  viewer: Viewer,
  fromId: string,
  toId: string,
  type: LinkType,
  note?: string | null,
): Promise<{ id: string; suggestFamily: boolean }> {
  if (!LINK_TYPES.includes(type)) throw new Error('סוג קשר לא תקין');
  if (fromId === toId) throw new Error('לא ניתן לקשר איש קשר לעצמו');

  const [from, to] = await Promise.all([isVisible(viewer, fromId), isVisible(viewer, toId)]);
  if (!from || !to) throw new Error('איש קשר לא נמצא');

  const suggestFamily = type === 'spouse' && (!from.household_id || !to.household_id || from.household_id !== to.household_id);

  const inverse = LINK_INVERSE[type];
  const existing = await pool.query(
    `select id from crm_links
     where (from_contact_id = $1 and to_contact_id = $2 and type = $3)
        or (from_contact_id = $2 and to_contact_id = $1 and type = $4)
     limit 1`,
    [fromId, toId, type, inverse],
  );
  if (existing.rows[0]) return { id: existing.rows[0].id as string, suggestFamily };

  const createdBy = viewer.employeeId || null;
  const rows = await pool.query(
    `insert into crm_links (from_contact_id, to_contact_id, type, note, created_by)
     values ($1,$2,$3,$4,$5) returning id`,
    [fromId, toId, type, note ?? null, createdBy],
  );
  const id = rows.rows[0].id as string;

  await logSystemActivity(fromId, viewer, { event: 'link', type, contact_id: toId });
  await logSystemActivity(toId, viewer, { event: 'link', type: inverse, contact_id: fromId });

  return { id, suggestFamily };
}

/** Remove a link; either endpoint being visible is enough. */
export async function removeLink(viewer: Viewer, linkId: string): Promise<boolean> {
  const rows = await pool.query(
    `select from_contact_id, to_contact_id from crm_links where id = $1`,
    [linkId],
  );
  const link = rows.rows[0];
  if (!link) return false;

  const [from, to] = await Promise.all([
    isVisible(viewer, link.from_contact_id),
    isVisible(viewer, link.to_contact_id),
  ]);
  if (!from && !to) return false;

  await pool.query(`delete from crm_links where id = $1`, [linkId]);
  return true;
}

/** Links seen from `contactId`: from-side keeps its type, to-side is flipped to the inverse. Same shape as ContactDetail.links. */
export async function linksFor(viewer: Viewer, contactId: string): Promise<ContactDetail['links']> {
  // The anchor contact itself must be visible, not just the people it links to.
  const anchorParams: unknown[] = [contactId];
  const anchorVis = visibilityClause(viewer, 'c', anchorParams);
  const anchor = await pool.query(`select 1 from crm_contacts c where c.id = $1 and ${anchorVis}`, anchorParams);
  if (!anchor.rows[0]) return [];

  const fromParams: unknown[] = [contactId];
  const fromVis = visibilityClause(viewer, 'x', fromParams);
  const fromLinks = (
    await pool.query(
      `select l.id, l.type, l.note, json_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name) as contact
       from crm_links l join crm_contacts x on x.id = l.to_contact_id
       where l.from_contact_id = $1 and ${fromVis}`,
      fromParams,
    )
  ).rows;

  const toParams: unknown[] = [contactId];
  const toVis = visibilityClause(viewer, 'x', toParams);
  const toLinks = (
    await pool.query(
      `select l.id, l.type, l.note, json_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name) as contact
       from crm_links l join crm_contacts x on x.id = l.from_contact_id
       where l.to_contact_id = $1 and ${toVis}`,
      toParams,
    )
  ).rows;

  return [
    ...fromLinks.map((r) => ({ id: r.id, type: r.type as LinkType, note: r.note, contact: r.contact })),
    ...toLinks.map((r) => ({ id: r.id, type: LINK_INVERSE[r.type as LinkType], note: r.note, contact: r.contact })),
  ];
}
