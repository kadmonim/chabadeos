// Important dates per contact (birthday, anniversary, yahrzeit, ...), plus
// the synthetic birthday row derived from crm_contacts.birthdate.
import { pool } from '../db';
import { israelToday } from '../dates';
import { visibilityClause } from './access';
import { DATE_KINDS } from './types';
import type { Viewer, ContactDate, DateKind } from './types';
import { gregToHebrew, formatHebrew, nextAnniversary, nextYahrzeit } from './hebrew-date';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIso(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function assertValidDate(kind: DateKind, date: string) {
  if (!(DATE_KINDS as readonly string[]).includes(kind)) throw new Error('סוג תאריך לא תקין');
  if (!isValidIso(date)) throw new Error('תאריך לא תקין');
}

function withComputed(row: { id: string; contact_id: string; kind: DateKind; date: string; label: string | null }): ContactDate {
  const hebrew = formatHebrew(gregToHebrew(row.date));
  const next = row.kind === 'yahrzeit' ? nextYahrzeit(row.date) : nextAnniversary(row.date);
  return { id: row.id, contact_id: row.contact_id, kind: row.kind, date: row.date, label: row.label, hebrew, next };
}

async function loadVisibleContactId(viewer: Viewer, contactId: string): Promise<boolean> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select 1 from crm_contacts c where c.id = $1 and ${vis}`, params);
  return !!rows.rows[0];
}

/** Dates for a contact, plus a synthetic 'birthdate' row first when crm_contacts.birthdate is set. */
export async function listDates(viewer: Viewer, contactId: string): Promise<ContactDate[]> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const contactRows = await pool.query(
    `select c.birthdate::text as birthdate from crm_contacts c where c.id = $1 and ${vis}`,
    params,
  );
  const contact = contactRows.rows[0];
  if (!contact) return [];

  const dateRows = await pool.query(
    `select id, contact_id, kind, date::text as date, label
     from crm_contact_dates where contact_id = $1 order by date`,
    [contactId],
  );

  const items: ContactDate[] = [];
  if (contact.birthdate) {
    items.push(
      withComputed({ id: 'birthdate', contact_id: contactId, kind: 'birthday', date: contact.birthdate, label: null }),
    );
  }
  for (const row of dateRows.rows as { id: string; contact_id: string; kind: DateKind; date: string; label: string | null }[]) {
    items.push(withComputed(row));
  }
  return items;
}

export async function addDate(
  viewer: Viewer,
  contactId: string,
  input: { kind: DateKind; date: string; label?: string | null },
): Promise<{ id: string }> {
  assertValidDate(input.kind, input.date);
  if (!(await loadVisibleContactId(viewer, contactId))) throw new Error('איש הקשר לא נמצא');

  const rows = await pool.query(
    `insert into crm_contact_dates (contact_id, kind, date, label) values ($1, $2, $3, $4) returning id`,
    [contactId, input.kind, input.date, input.label ?? null],
  );
  return { id: rows.rows[0].id as string };
}

export async function updateDate(
  viewer: Viewer,
  id: string,
  input: { kind?: DateKind; date?: string; label?: string | null },
): Promise<boolean> {
  if (input.kind !== undefined && !(DATE_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error('סוג תאריך לא תקין');
  }
  if (input.date !== undefined && !isValidIso(input.date)) throw new Error('תאריך לא תקין');

  const rows = await pool.query(`select contact_id from crm_contact_dates where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (!(await loadVisibleContactId(viewer, row.contact_id))) return false;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.kind !== undefined) sets.push(`kind = $${params.push(input.kind)}`);
  if (input.date !== undefined) sets.push(`date = $${params.push(input.date)}`);
  if (input.label !== undefined) sets.push(`label = $${params.push(input.label)}`);
  if (!sets.length) return true;
  const idIdx = params.push(id);
  await pool.query(`update crm_contact_dates set ${sets.join(', ')} where id = $${idIdx}`, params);
  return true;
}

export async function deleteDate(viewer: Viewer, id: string): Promise<boolean> {
  const rows = await pool.query(`select contact_id from crm_contact_dates where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (!(await loadVisibleContactId(viewer, row.contact_id))) return false;

  await pool.query(`delete from crm_contact_dates where id = $1`, [id]);
  return true;
}

/** Across visible, non-archived contacts: next occurrence within `opts.days` (default 30), soonest first. */
export async function upcomingDates(
  viewer: Viewer,
  opts?: { days?: number; limit?: number },
): Promise<(ContactDate & { contact: { id: string; first_name: string; last_name: string } })[]> {
  const days = Number.isFinite(opts?.days) ? Math.min(3660, Math.max(1, Math.floor(opts!.days as number))) : 30;
  const limit = Number.isFinite(opts?.limit) ? Math.min(500, Math.max(1, Math.floor(opts!.limit as number))) : 50;

  const params: unknown[] = [];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(
    `select c.id as contact_id, c.first_name, c.last_name, c.birthdate::text as birthdate,
       coalesce((
         select json_agg(json_build_object('id', d.id, 'kind', d.kind, 'date', d.date::text, 'label', d.label))
         from crm_contact_dates d where d.contact_id = c.id
       ), '[]'::json) as dates
     from crm_contacts c
     where not c.is_archived and ${vis}`,
    params,
  );

  const today = israelToday();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);
  const todayIso = toIso(today);
  const horizonIso = toIso(horizon);

  const results: (ContactDate & { contact: { id: string; first_name: string; last_name: string } })[] = [];
  for (const row of rows.rows as {
    contact_id: string;
    first_name: string;
    last_name: string;
    birthdate: string | null;
    dates: { id: string; kind: DateKind; date: string; label: string | null }[];
  }[]) {
    const contact = { id: row.contact_id, first_name: row.first_name, last_name: row.last_name };
    const entries: { id: string; kind: DateKind; date: string; label: string | null }[] = [];
    if (row.birthdate) entries.push({ id: 'birthdate', kind: 'birthday', date: row.birthdate, label: null });
    entries.push(...row.dates);

    for (const entry of entries) {
      const computed = withComputed({ ...entry, contact_id: row.contact_id });
      if (computed.next >= todayIso && computed.next <= horizonIso) {
        results.push({ ...computed, contact });
      }
    }
  }

  results.sort((a, b) => a.next.localeCompare(b.next));
  return results.slice(0, limit);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
