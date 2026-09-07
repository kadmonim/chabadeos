// CSV import: parse -> preview (header heuristics) -> run (create contacts,
// households, tags). Admin only. Deliberately dependency-free (no csv-parse)
// since this only ever runs against small admin-uploaded files.
import { pool } from '../db';
import { findDuplicate, createContact } from './contacts';
import { normalizePhone } from './phone';
import { STAGES } from './types';
import type { Viewer, ContactInput, Gender, Stage, ImportColumn, ImportPreview, ImportResult } from './types';

// ---------------------------------------------------------------------------
// parseCsv: RFC 4180-ish. Handles quoted fields (with embedded commas/
// semicolons/newlines and "" escaped quotes), CRLF and LF line endings, a
// leading UTF-8 BOM, and either ',' or ';' as the delimiter (auto-detected
// from the header line).
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  if (!text) return [];
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const headerLine = t.split(/\r\n|\n/, 1)[0] ?? '';
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let touched = false;
  const n = t.length;
  let i = 0;
  while (i < n) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      touched = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = '';
      touched = true;
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      touched = false;
      i += 1;
      continue;
    }
    field += ch;
    touched = true;
    i += 1;
  }
  if (touched || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Header heuristics (case-insensitive, Hebrew synonyms included).
// ---------------------------------------------------------------------------
type Classified = ImportColumn | 'ambiguous_family';

function classifyHeader(header: string): Classified {
  const s = header.trim().toLowerCase();
  if (!s) return 'skip';

  if (s === 'שם פרטי' || s === 'שם' || s.includes('first name') || s === 'first_name') return 'first_name';
  if (s.includes('שם משפחה') || s.includes('last name') || s.includes('surname') || s === 'last_name') return 'last_name';
  if (s === 'משפחה' || s.includes('family')) return 'ambiguous_family';
  if (s.includes('טלפון') || s.includes('נייד') || s.includes('סלולרי') || s.includes('phone') || s.includes('mobile')) return 'phone';
  if (s.includes('אימייל') || s.includes('דוא"ל') || s.includes('דואל') || s.includes('mail')) return 'email';
  if (s.includes('כתובת') || s.includes('רחוב') || s.includes('street')) return 'street';
  if (s.includes('עיר') || s.includes('city')) return 'city';
  if (s.includes('מיקוד') || s.includes('postal') || s.includes('zip')) return 'postal_code';
  if (s.includes('תגיות') || s.includes('תגית') || s.includes('tags') || s.includes('tag')) return 'tags';
  if (s.includes('הערות') || s.includes('notes') || s.includes('note')) return 'notes';
  if (s.includes('מקור') || s.includes('source')) return 'source';
  if (s.includes('מגדר') || s.includes('מין') || s.includes('gender')) return 'gender';
  if (s.includes('תאריך לידה') || s.includes('birthday') || s.includes('birthdate') || s.includes('dob')) return 'birthdate';
  if (s.includes('שלב') || s.includes('stage')) return 'stage';
  return 'skip';
}

function suggestColumns(headers: string[]): ImportColumn[] {
  const raw = headers.map(classifyHeader);
  const hasLastName = raw.includes('last_name');
  let usedFirstAmbiguous = false;
  return raw.map((c): ImportColumn => {
    if (c !== 'ambiguous_family') return c;
    if (hasLastName) return 'family';
    if (!usedFirstAmbiguous) {
      usedFirstAmbiguous = true;
      return 'last_name';
    }
    return 'family';
  });
}

/** Parse the file and suggest a column mapping; caller lets the admin adjust it before runImport. */
export function previewImport(text: string): ImportPreview {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], sample: [], suggested: [], row_count: 0 };
  const headers = rows[0];
  const dataRows = rows.slice(1);
  return {
    headers,
    sample: dataRows.slice(0, 5),
    suggested: suggestColumns(headers),
    row_count: dataRows.length,
  };
}

// ---------------------------------------------------------------------------
// runImport
// ---------------------------------------------------------------------------

function parseGender(raw: string): Gender | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === 'ז' || s === 'זכר' || s === 'm' || s === 'male') return 'male';
  if (s === 'נ' || s === 'נקבה' || s === 'f' || s === 'female') return 'female';
  return null;
}

function parseBirthdate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseStage(raw: string, defaultStage: Stage): Stage {
  const s = raw.trim();
  return (STAGES as readonly string[]).includes(s) ? (s as Stage) : defaultStage;
}

async function findOrCreateTagId(name: string, cache: Map<string, string>): Promise<string> {
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await pool.query(`select id from crm_tags where name ilike $1 limit 1`, [name.trim()]);
  if (existing.rows[0]) {
    const id = existing.rows[0].id as string;
    cache.set(key, id);
    return id;
  }
  const created = await pool.query(`insert into crm_tags (name) values ($1) returning id`, [name.trim()]);
  const id = created.rows[0].id as string;
  cache.set(key, id);
  return id;
}

/**
 * Run an admin-reviewed import. Processed row by row (no giant transaction —
 * this is an admin tool run rarely, and per-row error collection matters more
 * than atomicity). Dedupe uses findDuplicate before each createContact.
 */
export async function runImport(
  viewer: Viewer,
  text: string,
  mapping: ImportColumn[],
  opts: { create_families: 'by_column' | 'by_address' | 'none'; default_stage?: Stage; tag?: string },
): Promise<ImportResult> {
  if (viewer.role !== 'admin') throw new Error('אין הרשאה');

  const rows = parseCsv(text);
  const result: ImportResult = { created: 0, duplicates: 0, families: 0, errors: [] };
  if (!rows.length) return result;

  const dataRows = rows.slice(1);
  const defaultStage = opts.default_stage && (STAGES as readonly string[]).includes(opts.default_stage) ? opts.default_stage : 'new';

  const fieldIndex: Partial<Record<ImportColumn, number>> = {};
  mapping.forEach((col, i) => {
    if (col && col !== 'skip' && !(col in fieldIndex)) fieldIndex[col] = i;
  });
  const valueOf = (row: string[], col: ImportColumn): string => {
    const idx = fieldIndex[col];
    if (idx === undefined) return '';
    return (row[idx] ?? '').trim();
  };

  const tagCache = new Map<string, string>();
  // groupKey -> household id + which address fields are already filled.
  const households = new Map<string, { id: string; street: boolean; city: boolean; postal_code: boolean }>();

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowNumber = i + 1; // 1-based data row, header excluded
    const row = dataRows[i];
    if (row.every((cell) => !cell || !cell.trim())) continue; // fully-empty row

    try {
      const firstName = valueOf(row, 'first_name');
      if (!firstName) throw new Error('שם פרטי חסר');

      const street = valueOf(row, 'street') || null;
      const city = valueOf(row, 'city') || null;
      const postalCode = valueOf(row, 'postal_code') || null;
      const familyRaw = valueOf(row, 'family');
      const lastName = valueOf(row, 'last_name') || null;

      const genderRaw = valueOf(row, 'gender');
      const birthdateRaw = valueOf(row, 'birthdate');
      const stageRaw = valueOf(row, 'stage');
      const phoneRaw = valueOf(row, 'phone');
      const emailRaw = valueOf(row, 'email');

      const input: ContactInput = {
        first_name: firstName,
        last_name: lastName ?? undefined,
        gender: parseGender(genderRaw),
        birthdate: parseBirthdate(birthdateRaw),
        email: emailRaw || null,
        phone: phoneRaw || null,
        stage: parseStage(stageRaw, defaultStage),
        source: valueOf(row, 'source') || null,
        notes: valueOf(row, 'notes') || null,
      };

      const { e164 } = normalizePhone(input.phone ?? null);
      const email = input.email ? input.email.trim().toLowerCase() || null : null;
      const duplicate = await findDuplicate(e164, email);
      if (duplicate) {
        result.duplicates += 1;
        continue;
      }

      // Family grouping, before creating the contact so we know its household.
      let groupKey: string | null = null;
      if (opts.create_families === 'by_column' && familyRaw) {
        groupKey = familyRaw;
      } else if (opts.create_families === 'by_address' && street && city) {
        groupKey = `${street}|${city}`;
      }

      let householdId: string | null = null;
      let householdRole: 'head' | 'other' | null = null;
      if (groupKey) {
        const groupCacheKey = `${opts.create_families}:${groupKey.toLowerCase()}`;
        let entry = households.get(groupCacheKey);
        if (!entry) {
          const name = opts.create_families === 'by_column'
            ? (familyRaw.trim().startsWith('משפחת') ? familyRaw.trim() : `משפחת ${familyRaw.trim()}`)
            : `משפחת ${(lastName || firstName).trim()}`;
          const created = await pool.query(
            `insert into crm_households (name, street, city, postal_code) values ($1,$2,$3,$4) returning id`,
            [name, street, city, postalCode],
          );
          entry = {
            id: created.rows[0].id as string,
            street: !!street,
            city: !!city,
            postal_code: !!postalCode,
          };
          households.set(groupCacheKey, entry);
          result.families += 1;
          householdRole = 'head';
        } else {
          householdRole = 'other';
          const fillSets: string[] = [];
          const fillParams: unknown[] = [];
          if (!entry.street && street) {
            fillSets.push(`street = $${fillParams.push(street)}`);
            entry.street = true;
          }
          if (!entry.city && city) {
            fillSets.push(`city = $${fillParams.push(city)}`);
            entry.city = true;
          }
          if (!entry.postal_code && postalCode) {
            fillSets.push(`postal_code = $${fillParams.push(postalCode)}`);
            entry.postal_code = true;
          }
          if (fillSets.length) {
            const idIdx = fillParams.push(entry.id);
            await pool.query(`update crm_households set ${fillSets.join(', ')} where id = $${idIdx}`, fillParams);
          }
        }
        householdId = entry.id;
        input.household_id = householdId;
        input.household_role = householdRole;
      }

      const createResult = await createContact(viewer, input, { force: true });
      if (!('id' in createResult)) {
        // Shouldn't happen since we deduped above, but stay defensive.
        result.duplicates += 1;
        continue;
      }
      result.created += 1;

      const tagsRaw = valueOf(row, 'tags');
      const tagNames = tagsRaw
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const tagIds = new Set<string>();
      for (const tagName of tagNames) {
        tagIds.add(await findOrCreateTagId(tagName, tagCache));
      }
      if (opts.tag) tagIds.add(opts.tag);
      for (const tagId of tagIds) {
        await pool.query(
          `insert into crm_contact_tags (contact_id, tag_id) values ($1, $2) on conflict do nothing`,
          [createResult.id, tagId],
        );
      }
    } catch (e) {
      result.errors.push({ row: rowNumber, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return result;
}
