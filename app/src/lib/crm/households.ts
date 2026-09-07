// Household ("family" in the UI) queries: list/search/detail plus the writes
// that move contacts in and out of a household. A household has no
// visibility of its own — it is visible when at least one member is (admins
// see everything). All SQL here mirrors the patterns in contacts.ts.
import { pool } from '../db';
import { visibilityClause } from './access';
import { contactSummarySelect, contactSummaryJoins, getContact, createContact, logSystemActivity } from './contacts';
import type {
  Viewer, HouseholdSummary, HouseholdDetail, HouseholdInput, HouseholdMember, HouseholdRole,
  ContactInput, ContactSummary, Page,
} from './types';

function encodeCursor(values: unknown[]): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}
function decodeCursor(cursor: string, arity: number): unknown[] {
  let values: unknown;
  try {
    values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('סמן העמוד אינו תקין');
  }
  if (!Array.isArray(values) || values.length !== arity) throw new Error('סמן העמוד אינו תקין');
  return values;
}

// Row shape shared by listHouseholds/searchHouseholds: summary columns plus
// member_count and heads, computed with correlated subqueries so the
// visibility check for `heads` matches the viewer exactly.
function householdSummarySelect(viewer: Viewer, params: unknown[]): string {
  const memberVis = visibilityClause(viewer, 'm3', params);
  return `
    h.id, h.name, h.street, h.city, h.postal_code, h.updated_at::text as updated_at,
    (select count(*)::int from crm_contacts m2 where m2.household_id = h.id and not m2.is_archived) as member_count,
    coalesce((
      select json_agg(m3.first_name || ' ' || m3.last_name order by m3.household_role, lower(m3.first_name))
      from crm_contacts m3
      where m3.household_id = h.id and not m3.is_archived
        and m3.household_role in ('head', 'spouse') and ${memberVis}
    ), '[]'::json) as heads`;
}

/** Only households with at least one visible (or, for admins, any) non-archived member. */
function visibleHouseholdWhere(viewer: Viewer, params: unknown[]): string {
  const vis = visibilityClause(viewer, 'm1', params);
  return `exists (select 1 from crm_contacts m1 where m1.household_id = h.id and not m1.is_archived and ${vis})`;
}

// A household is addressable by a viewer only when they can see at least one member
// (admins: any). Used before attaching people to it.
async function householdVisible(viewer: Viewer, householdId: string): Promise<boolean> {
  const params: unknown[] = [householdId];
  const where = visibleHouseholdWhere(viewer, params);
  const rows = await pool.query(`select 1 from crm_households h where h.id = $1 and ${where}`, params);
  return !!rows.rows[0];
}

/** Paginated, filtered household list (keyset pagination, sort by lower(name), id). */
export async function listHouseholds(
  viewer: Viewer,
  opts?: { q?: string; limit?: number; after?: string | null },
): Promise<Page<HouseholdSummary>> {
  const limit = Math.min(200, Math.max(1, Math.floor(Number.isFinite(opts?.limit) ? (opts!.limit as number) : 50)));

  const params: unknown[] = [];
  const clauses: string[] = [visibleHouseholdWhere(viewer, params)];
  if (opts?.q && opts.q.trim()) {
    const like = `%${opts.q.trim()}%`;
    const nameIdx = params.push(like);
    const cityIdx = params.push(like);
    const streetIdx = params.push(like);
    clauses.push(`(h.name ilike $${nameIdx} or h.city ilike $${cityIdx} or h.street ilike $${streetIdx})`);
  }

  let cursorWhere = '';
  if (opts?.after) {
    const [name, id] = decodeCursor(opts.after, 2) as [string, string];
    const nameIdx = params.push(name);
    const idIdx = params.push(id);
    cursorWhere = ` and (lower(h.name), h.id) > ($${nameIdx}::text, $${idIdx}::text)`;
  }

  const selectParams: unknown[] = [...params];
  const summarySelect = householdSummarySelect(viewer, selectParams);
  const rows = (
    await pool.query(
      `select ${summarySelect}
       from crm_households h
       where ${clauses.join(' and ')}${cursorWhere}
       order by lower(h.name), h.id
       limit ${limit + 1}`,
      selectParams,
    )
  ).rows;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore
    ? encodeCursor([String(page[page.length - 1].name).toLowerCase(), page[page.length - 1].id])
    : null;

  const totalRows = await pool.query(`select count(*)::int as n from crm_households h where ${clauses.join(' and ')}`, params);
  const total = totalRows.rows[0]?.n ?? 0;

  return { items: page as HouseholdSummary[], next, total };
}

/** Households for the picker: no pagination, small limit. */
export async function searchHouseholds(viewer: Viewer, q: string, limit = 20): Promise<HouseholdSummary[]> {
  const params: unknown[] = [];
  const clauses: string[] = [visibleHouseholdWhere(viewer, params)];
  const query = (q ?? '').trim();
  if (query) {
    const like = `%${query}%`;
    const nameIdx = params.push(like);
    const cityIdx = params.push(like);
    const streetIdx = params.push(like);
    clauses.push(`(h.name ilike $${nameIdx} or h.city ilike $${cityIdx} or h.street ilike $${streetIdx})`);
  }
  const summarySelect = householdSummarySelect(viewer, params);
  const limitIdx = params.push(Math.min(50, Math.max(1, limit)));
  const rows = await pool.query(
    `select ${summarySelect}
     from crm_households h
     where ${clauses.join(' and ')}
     order by lower(h.name)
     limit $${limitIdx}`,
    params,
  );
  return rows.rows as HouseholdSummary[];
}

const MEMBER_ROLE_RANK = `case c.household_role when 'head' then 0 when 'spouse' then 1 when 'child' then 2 when 'other' then 3 else 4 end`;

/** Full household record: visibility-filtered members, ordered head/spouse/child(by birthdate)/other, gift totals. */
export async function getHousehold(viewer: Viewer, id: string): Promise<HouseholdDetail | null> {
  const hRows = await pool.query(
    `select h.id, h.name, h.street, h.city, h.postal_code, h.notes, h.updated_at::text as updated_at,
       case when o.id is null then null else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner
     from crm_households h left join system_employees o on o.id = h.owner_employee_id
     where h.id = $1`,
    [id],
  );
  const household = hRows.rows[0];
  if (!household) return null;

  const memberParams: unknown[] = [id];
  const vis = visibilityClause(viewer, 'c', memberParams);
  const memberRows = await pool.query(
    `select ${contactSummarySelect()}, c.household_role, c.birthdate::text as birthdate
     from crm_contacts c ${contactSummaryJoins()}
     where c.household_id = $1 and not c.is_archived and ${vis}
     order by ${MEMBER_ROLE_RANK},
       case when c.household_role = 'child' then c.birthdate end asc nulls last,
       lower(c.first_name), lower(c.last_name)`,
    memberParams,
  );
  const members = memberRows.rows as HouseholdMember[];
  if (!members.length && viewer.role !== 'admin') return null;

  const gifts = await pool.query(
    `select coalesce(sum(g.amount), 0)::float as total, count(*)::int as n
     from crm_gifts g
     where g.contact_id in (select id from crm_contacts where household_id = $1)`,
    [id],
  );

  return {
    id: household.id,
    name: household.name,
    street: household.street,
    city: household.city,
    postal_code: household.postal_code,
    notes: household.notes,
    owner: household.owner,
    updated_at: household.updated_at,
    member_count: members.length,
    heads: members.filter((m) => m.household_role === 'head' || m.household_role === 'spouse').map((m) => `${m.first_name} ${m.last_name}`.trim()),
    members,
    gift_total: gifts.rows[0]?.total ?? 0,
    gift_count: gifts.rows[0]?.n ?? 0,
  };
}

/** Create a household ("family"); name is required. */
export async function createHousehold(viewer: Viewer, input: HouseholdInput): Promise<{ id: string }> {
  if (!input.name || !input.name.trim()) throw new Error('שם משפחה חסר');
  const rows = await pool.query(
    `insert into crm_households (name, street, city, postal_code, notes, owner_employee_id)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [
      input.name.trim(),
      input.street ?? null,
      input.city ?? null,
      input.postal_code ?? null,
      input.notes ?? null,
      input.owner_employee_id ?? null,
    ],
  );
  return { id: rows.rows[0].id as string };
}

const HOUSEHOLD_INPUT_FIELDS = ['name', 'street', 'city', 'postal_code', 'notes', 'owner_employee_id'] as const;

/** Update provided fields only (undefined = untouched, null = clear). False when the household doesn't exist or isn't visible. */
export async function updateHousehold(viewer: Viewer, id: string, input: HouseholdInput): Promise<boolean> {
  const existing = await getHousehold(viewer, id);
  if (!existing) return false;

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of HOUSEHOLD_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      sets.push(`${field} = $${params.push((input as any)[field] ?? null)}`);
    }
  }
  if (!sets.length) return true;
  const idIdx = params.push(id);
  await pool.query(`update crm_households set ${sets.join(', ')} where id = $${idIdx}`, params);
  return true;
}

/**
 * Ensure a contact belongs to a household, creating one ("משפחת <last name>")
 * if needed. The contact keeps its own visibility; the household inherits
 * nothing else from the contact.
 */
export async function ensureFamilyFor(viewer: Viewer, contactId: string): Promise<{ id: string; created: boolean }> {
  const contact = await getContact(viewer, contactId);
  if (!contact) throw new Error('איש קשר לא נמצא');
  if (contact.household?.id) return { id: contact.household.id, created: false };

  const surname = (contact.last_name || contact.first_name || '').trim();
  const name = `משפחת ${surname}`;
  const rows = await pool.query(`insert into crm_households (name) values ($1) returning id`, [name]);
  const householdId = rows.rows[0].id as string;

  await pool.query(
    `update crm_contacts set household_id = $1, household_role = coalesce(household_role, 'head') where id = $2`,
    [householdId, contactId],
  );
  await logSystemActivity(contactId, viewer, { event: 'family', household_id: householdId });
  return { id: householdId, created: true };
}

/** Move a contact into/out of a household. `householdId = null` clears both fields. */
export async function setMember(
  viewer: Viewer,
  contactId: string,
  householdId: string | null,
  role: HouseholdRole | null,
): Promise<boolean> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select id from crm_contacts c where c.id = $1 and ${vis}`, params);
  if (!rows.rows[0]) return false;

  if (householdId === null) {
    await pool.query(`update crm_contacts set household_id = null, household_role = null where id = $1`, [contactId]);
  } else {
    if (!(await householdVisible(viewer, householdId))) return false;
    await pool.query(`update crm_contacts set household_id = $1, household_role = $2 where id = $3`, [
      householdId,
      role,
      contactId,
    ]);
  }
  await logSystemActivity(contactId, viewer, { event: 'family', household_id: householdId });
  return true;
}

/** Create a new contact directly into a household, defaulting last_name from the household's surname. */
export async function addFamilyMember(
  viewer: Viewer,
  householdId: string,
  input: ContactInput & { household_role: HouseholdRole },
): Promise<{ id: string } | { duplicate: ContactSummary }> {
  const hRows = await pool.query(`select name from crm_households where id = $1`, [householdId]);
  const household = hRows.rows[0];
  if (!household || !(await householdVisible(viewer, householdId))) throw new Error('משפחה לא נמצאה');

  const lastName = input.last_name && input.last_name.trim() ? input.last_name.trim() : household.name.replace(/^משפחת\s+/, '');

  return createContact(viewer, {
    ...input,
    last_name: lastName,
    household_id: householdId,
    household_role: input.household_role,
  });
}
