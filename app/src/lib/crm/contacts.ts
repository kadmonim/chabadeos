// Contact queries: index/search/detail plus the writes that keep the
// timeline and sharing in sync. All reads apply visibilityClause; writes that
// touch ownership/visibility require canManage.
import { pool } from '../db';
import { visibilityClause, canManage } from './access';
import { normalizePhone } from './phone';
import { LINK_INVERSE } from './types';
import type {
  Viewer, ContactSummary, ContactDetail, ContactInput, ContactFilter, ContactSort, Page, LinkType,
} from './types';

// One reusable SELECT fragment for every ContactSummary column. Callers embed
// it after `select` with `from crm_contacts c ${contactSummaryJoins()}`.
function contactSummarySelect(): string {
  return `
    c.id, c.first_name, c.last_name, c.hebrew_name, c.email, c.phone, c.phone_display,
    c.stage, c.visibility,
    case when o.id is null then null else json_build_object('id', o.id, 'full_name', o.full_name, 'email', o.email) end as owner,
    case when h.id is null then null else json_build_object('id', h.id, 'name', h.name) end as household,
    coalesce((
      select json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
      from crm_contact_tags ct join crm_tags t on t.id = ct.tag_id
      where ct.contact_id = c.id
    ), '[]'::json) as tags,
    c.last_activity_at::text as last_activity_at,
    c.updated_at::text as updated_at,
    c.created_at::text as created_at`;
}

// Joins backing contactSummarySelect(); every list/search/detail query needs these.
function contactSummaryJoins(): string {
  return `left join system_employees o on o.id = c.owner_employee_id left join crm_households h on h.id = c.household_id`;
}

// Sort key expressions + direction for a given ContactSort, used for both
// ORDER BY and the keyset cursor tuple comparison.
function sortSpec(sort: ContactSort, dir?: 'asc' | 'desc') {
  const defaultDir: 'asc' | 'desc' = sort === 'name' || sort === 'stage' ? 'asc' : 'desc';
  // Whitelist: dir and sort are spliced into SQL text, never trust the caller.
  const direction: 'asc' | 'desc' = dir === 'desc' ? 'desc' : dir === 'asc' ? 'asc' : defaultDir;
  const specs: Record<ContactSort, { exprs: string[]; casts: string[] }> = {
    name: { exprs: ['lower(c.last_name)', 'lower(c.first_name)', 'c.id'], casts: ['text', 'text', 'text'] },
    stage: {
      exprs: ['c.stage', 'lower(c.last_name)', 'lower(c.first_name)', 'c.id'],
      casts: ['text', 'text', 'text', 'text'],
    },
    updated: { exprs: ['c.updated_at', 'c.id'], casts: ['timestamptz', 'text'] },
    created: { exprs: ['c.created_at', 'c.id'], casts: ['timestamptz', 'text'] },
    last_activity: {
      exprs: [`coalesce(c.last_activity_at, 'epoch'::timestamptz)`, 'c.id'],
      casts: ['timestamptz', 'text'],
    },
  };
  return { ...(specs[sort] ?? specs.name), dir: direction };
}

// Builds the shared filter/visibility WHERE for listContacts (used for both
// the page query and the total count), pushing params as it goes.
function buildContactWhere(viewer: Viewer, filter: ContactFilter, params: unknown[]): string {
  const clauses: string[] = [visibilityClause(viewer, 'c', params)];
  clauses.push(`c.is_archived = $${params.push(filter.archived ?? false)}`);
  if (filter.q && filter.q.trim()) {
    const q = filter.q.trim();
    const qDigits = q.replace(/\D/g, '');
    const nameIdx = params.push(`%${q}%`);
    const hebrewIdx = params.push(`%${q}%`);
    let clause = `((c.first_name || ' ' || c.last_name) ilike $${nameIdx} or c.hebrew_name ilike $${hebrewIdx}`;
    if (qDigits) {
      const phoneIdx = params.push(`%${qDigits}%`);
      clause += ` or c.phone like $${phoneIdx}`;
    }
    const emailIdx = params.push(`%${q}%`);
    clause += ` or c.email ilike $${emailIdx})`;
    clauses.push(clause);
  }
  if (filter.stage) {
    const stages = Array.isArray(filter.stage) ? filter.stage : [filter.stage];
    clauses.push(`c.stage = any($${params.push(stages)}::text[])`);
  }
  if (filter.tag) {
    const idx = params.push(filter.tag);
    clauses.push(
      `exists (select 1 from crm_contact_tags ct join crm_tags t on t.id = ct.tag_id where ct.contact_id = c.id and (t.id = $${idx} or t.name = $${idx}))`,
    );
  }
  if (filter.owner) clauses.push(`c.owner_employee_id = $${params.push(filter.owner)}`);
  if (filter.household) clauses.push(`c.household_id = $${params.push(filter.household)}`);
  if (filter.visibility) clauses.push(`c.visibility = $${params.push(filter.visibility)}`);
  if (filter.updated_since) clauses.push(`c.updated_at >= $${params.push(filter.updated_since)}`);
  return clauses.join(' and ');
}

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

/** Paginated, filtered contact list (keyset pagination). Default sort: name asc, limit 50. */
export async function listContacts(
  viewer: Viewer,
  filter: ContactFilter,
  opts?: { sort?: ContactSort; dir?: 'asc' | 'desc'; limit?: number; after?: string | null },
): Promise<Page<ContactSummary>> {
  const sort = opts?.sort ?? 'name';
  const { exprs, casts, dir } = sortSpec(sort, opts?.dir);
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));

  const params: unknown[] = [];
  const baseWhere = buildContactWhere(viewer, filter, params);

  let cursorWhere = '';
  if (opts?.after) {
    const values = decodeCursor(opts.after, exprs.length);
    const op = dir === 'asc' ? '>' : '<';
    const placeholders = values.map((v, i) => {
      const idx = params.push(v);
      return `$${idx}::${casts[i]}`;
    });
    cursorWhere = ` and (${exprs.join(', ')}) ${op} (${placeholders.join(', ')})`;
  }

  const orderBy = exprs.map((e) => `${e} ${dir}`).join(', ');
  const cursorTuple = `json_build_array(${exprs.join(', ')}) as __cursor`;

  const rows = (
    await pool.query(
      `select ${contactSummarySelect()}, ${cursorTuple}
       from crm_contacts c ${contactSummaryJoins()}
       where ${baseWhere}${cursorWhere}
       order by ${orderBy}
       limit ${limit + 1}`,
      params,
    )
  ).rows;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const next = hasMore ? encodeCursor(page[page.length - 1].__cursor) : null;

  const totalParams: unknown[] = [];
  const totalWhere = buildContactWhere(viewer, filter, totalParams);
  const totalRows = await pool.query(`select count(*)::int as n from crm_contacts c where ${totalWhere}`, totalParams);
  const total = totalRows.rows[0]?.n ?? 0;

  return {
    items: page.map(({ __cursor, ...rest }) => rest as ContactSummary),
    next,
    total,
  };
}

/** Fuzzy search across name/hebrew name/phone/email, best match first. */
export async function searchContacts(viewer: Viewer, q: string, limit = 20): Promise<ContactSummary[]> {
  const query = (q ?? '').trim();
  if (query.length < 1) return [];
  const digits = query.replace(/\D/g, '');

  const params: unknown[] = [];
  const visIdx = visibilityClause(viewer, 'c', params);
  const qIdx = params.push(query);
  const prefixIdx = params.push(`${query}%`);
  const hebrewIdx = params.push(`%${query}%`);
  const emailIdx = params.push(`%${query}%`);
  let phoneClause = '';
  let phoneMatch = 'false';
  if (digits.length >= 3) {
    const phoneIdx = params.push(`%${digits}%`);
    phoneClause = ` or c.phone like $${phoneIdx}`;
    phoneMatch = `c.phone like $${phoneIdx}`;
  }
  const limitIdx = params.push(Math.min(50, Math.max(1, limit)));

  const rows = (
    await pool.query(
      `select ${contactSummarySelect()}
       from crm_contacts c ${contactSummaryJoins()}
       where ${visIdx} and not c.is_archived
         and (
           similarity(c.first_name || ' ' || c.last_name, $${qIdx}) > 0.2
           or (c.first_name || ' ' || c.last_name) ilike $${prefixIdx}
           or coalesce(c.hebrew_name, '') ilike $${hebrewIdx}
           or c.email ilike $${emailIdx}
           ${phoneClause}
         )
       order by
         (case when ${phoneMatch} then 1 else 0 end) desc,
         greatest(similarity(c.first_name || ' ' || c.last_name, $${qIdx}), similarity(coalesce(c.hebrew_name, ''), $${qIdx})) desc,
         lower(c.last_name), lower(c.first_name)
       limit $${limitIdx}`,
      params,
    )
  ).rows;
  return rows as ContactSummary[];
}

/** Full contact record: shares, household members, flipped links, tasks/gifts summary. */
export async function getContact(viewer: Viewer, id: string): Promise<ContactDetail | null> {
  const mainParams: unknown[] = [id];
  const vis = visibilityClause(viewer, 'c', mainParams);
  const mainRows = await pool.query(
    `select ${contactSummarySelect()},
       c.gender, c.birthdate::text as birthdate, c.household_role, c.source, c.notes, c.is_archived,
       case when cb.id is null then null else json_build_object('id', cb.id, 'full_name', cb.full_name, 'email', cb.email) end as created_by
     from crm_contacts c ${contactSummaryJoins()}
     left join system_employees cb on cb.id = c.created_by
     where c.id = $1 and ${vis}`,
    mainParams,
  );
  const contact = mainRows.rows[0];
  if (!contact) return null;

  const shares = (
    await pool.query(
      `select e.id, e.full_name, e.email
       from crm_contact_shares s join system_employees e on e.id = s.employee_id
       where s.contact_id = $1
       order by lower(e.full_name)`,
      [id],
    )
  ).rows;

  const householdMembersParams: unknown[] = [id, contact.household?.id ?? null];
  const memberVis = visibilityClause(viewer, 'm', householdMembersParams);
  const householdMembers = contact.household
    ? (
        await pool.query(
          `select m.id, m.first_name, m.last_name, m.household_role
           from crm_contacts m
           where m.id <> $1 and m.household_id = $2 and not m.is_archived and ${memberVis}
           order by lower(m.last_name), lower(m.first_name)`,
          householdMembersParams,
        )
      ).rows
    : [];

  // Links seen from this contact: from-side keeps its type, to-side is flipped.
  const fromParams: unknown[] = [id];
  const fromVis = visibilityClause(viewer, 'x', fromParams);
  const fromLinks = (
    await pool.query(
      `select l.id, l.type, l.note, json_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name) as contact
       from crm_links l join crm_contacts x on x.id = l.to_contact_id
       where l.from_contact_id = $1 and ${fromVis}`,
      fromParams,
    )
  ).rows;
  const toParams: unknown[] = [id];
  const toVis = visibilityClause(viewer, 'x', toParams);
  const toLinks = (
    await pool.query(
      `select l.id, l.type, l.note, json_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name) as contact
       from crm_links l join crm_contacts x on x.id = l.from_contact_id
       where l.to_contact_id = $1 and ${toVis}`,
      toParams,
    )
  ).rows;
  const links = [
    ...fromLinks.map((r) => ({ id: r.id, type: r.type as LinkType, note: r.note, contact: r.contact })),
    ...toLinks.map((r) => ({ id: r.id, type: LINK_INVERSE[r.type as LinkType], note: r.note, contact: r.contact })),
  ];

  const openTasks = await pool.query(
    `select count(*)::int as n from crm_tasks where contact_id = $1 and done_at is null`,
    [id],
  );
  const gifts = await pool.query(
    `select coalesce(sum(amount), 0)::float as total, count(*)::int as n from crm_gifts where contact_id = $1`,
    [id],
  );

  const { household, ...rest } = contact;
  return {
    ...rest,
    household,
    shares,
    household_members: householdMembers,
    links,
    open_tasks: openTasks.rows[0]?.n ?? 0,
    gift_total: gifts.rows[0]?.total ?? 0,
    gift_count: gifts.rows[0]?.n ?? 0,
  } as ContactDetail;
}

/** Global (unfiltered by visibility) phone/email match, for create-time dedupe. */
export async function findDuplicate(phoneE164: string | null, email: string | null): Promise<ContactSummary | null> {
  if (!phoneE164 && !email) return null;
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (phoneE164) clauses.push(`c.phone = $${params.push(phoneE164)}`);
  if (email) clauses.push(`c.email = $${params.push(email)}`);
  const rows = await pool.query(
    `select ${contactSummarySelect()}
     from crm_contacts c ${contactSummaryJoins()}
     where not c.is_archived and (${clauses.join(' or ')})
     limit 1`,
    params,
  );
  return (rows.rows[0] as ContactSummary) ?? null;
}

/** Create a contact, deduping on phone/email unless opts.force. */
export async function createContact(
  viewer: Viewer,
  input: ContactInput,
  opts?: { force?: boolean },
): Promise<{ id: string } | { duplicate: ContactSummary }> {
  if (!input.first_name || !input.first_name.trim()) throw new Error('שם פרטי חסר');

  const { e164, display } = normalizePhone(input.phone ?? null);
  const email = input.email ? input.email.trim().toLowerCase() || null : null;

  if (!opts?.force) {
    const duplicate = await findDuplicate(e164, email);
    if (duplicate) return { duplicate };
  }

  const ownerId = input.owner_employee_id !== undefined ? input.owner_employee_id : viewer.employeeId || null;
  const createdBy = viewer.employeeId || null;

  const rows = await pool.query(
    `insert into crm_contacts
       (first_name, last_name, hebrew_name, gender, birthdate, email, phone, phone_display,
        household_id, household_role, stage, owner_employee_id, visibility, source, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning id`,
    [
      input.first_name.trim(),
      input.last_name?.trim() ?? '',
      input.hebrew_name ?? null,
      input.gender ?? null,
      input.birthdate ?? null,
      email,
      e164,
      display,
      input.household_id ?? null,
      input.household_role ?? null,
      input.stage ?? 'new',
      ownerId,
      input.visibility ?? 'public',
      input.source ?? null,
      input.notes ?? null,
      createdBy,
    ],
  );
  const id = rows.rows[0].id as string;
  await logSystemActivity(id, viewer, { event: 'created' });
  return { id };
}

// Columns that map 1:1 from ContactInput to crm_contacts, excluding phone
// (normalised separately) and visibility/owner (permission-checked separately).
const SIMPLE_INPUT_FIELDS = [
  'first_name', 'last_name', 'hebrew_name', 'gender', 'birthdate', 'email',
  'household_id', 'household_role', 'stage', 'source', 'notes',
] as const;

/** Update provided fields only (undefined = untouched, null = clear). Returns false when not visible. */
export async function updateContact(viewer: Viewer, id: string, input: ContactInput): Promise<boolean> {
  const currentParams: unknown[] = [id];
  const vis = visibilityClause(viewer, 'c', currentParams);
  const currentRows = await pool.query(
    `select owner_employee_id, visibility, stage from crm_contacts c where c.id = $1 and ${vis}`,
    currentParams,
  );
  const current = currentRows.rows[0];
  if (!current) return false;

  const touchesShareOrOwner =
    Object.prototype.hasOwnProperty.call(input, 'visibility') ||
    Object.prototype.hasOwnProperty.call(input, 'owner_employee_id');
  if (touchesShareOrOwner && !canManage(viewer, current)) {
    throw new Error('אין הרשאה לשנות שיתוף או בעלים');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of SIMPLE_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      sets.push(`${field} = $${params.push((input as any)[field] ?? null)}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'phone')) {
    const { e164, display } = normalizePhone(input.phone ?? null);
    sets.push(`phone = $${params.push(e164)}`);
    sets.push(`phone_display = $${params.push(display)}`);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'owner_employee_id')) {
    sets.push(`owner_employee_id = $${params.push(input.owner_employee_id ?? null)}`);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'visibility')) {
    sets.push(`visibility = $${params.push(input.visibility)}`);
  }

  if (sets.length) {
    const idIdx = params.push(id);
    await pool.query(`update crm_contacts set ${sets.join(', ')} where id = $${idIdx}`, params);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'stage') && input.stage !== current.stage) {
    await logSystemActivity(id, viewer, { event: 'stage', from: current.stage, to: input.stage });
  }
  return true;
}

/** Archive/unarchive; owner or admin only. */
export async function archiveContact(viewer: Viewer, id: string, archived = true): Promise<boolean> {
  const params: unknown[] = [id];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select owner_employee_id from crm_contacts c where c.id = $1 and ${vis}`, params);
  const current = rows.rows[0];
  if (!current || !canManage(viewer, current)) return false;
  await pool.query(`update crm_contacts set is_archived = $1 where id = $2`, [archived, id]);
  return true;
}

/** Replace the share list for a restricted contact; owner or admin only. */
export async function setShares(viewer: Viewer, id: string, employeeIds: string[]): Promise<boolean> {
  const params: unknown[] = [id];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select owner_employee_id from crm_contacts c where c.id = $1 and ${vis}`, params);
  const current = rows.rows[0];
  if (!current || !canManage(viewer, current)) return false;

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from crm_contact_shares where contact_id = $1', [id]);
    for (const employeeId of employeeIds) {
      await client.query(
        `insert into crm_contact_shares (contact_id, employee_id) values ($1, $2) on conflict do nothing`,
        [id, employeeId],
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

/** Record a system-generated timeline entry and bump last_activity_at. */
export async function logSystemActivity(
  contactId: string,
  viewer: Viewer,
  meta: Record<string, unknown>,
  body?: string,
): Promise<void> {
  const createdBy = viewer.employeeId || null;
  await pool.query(
    `insert into crm_activities (contact_id, kind, body, created_by, meta) values ($1, 'system', $2, $3, $4)`,
    [contactId, body ?? null, createdBy, JSON.stringify(meta)],
  );
  await pool.query(`update crm_contacts set last_activity_at = now() where id = $1`, [contactId]);
}
