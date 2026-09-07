// Contact timeline: activities (notes/calls/visits/messages/meetings) plus
// system-generated entries logged by other services via contacts.logSystemActivity.
import { pool } from '../db';
import { visibilityClause } from './access';
import { ACTIVITY_KINDS, STAGE_LABELS, LINK_LABELS } from './types';
import type { Viewer, Activity, ActivityKind, Stage, LinkType } from './types';

function activitySelect(): string {
  return `
    a.id, a.contact_id, a.kind, a.body,
    a.occurred_at::text as occurred_at,
    case when e.id is null then null else json_build_object('id', e.id, 'full_name', e.full_name, 'email', e.email) end as created_by,
    a.meta,
    a.created_at::text as created_at`;
}
function activityJoins(): string {
  return `left join system_employees e on e.id = a.created_by`;
}

async function isContactVisible(viewer: Viewer, contactId: string): Promise<boolean> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select 1 from crm_contacts c where c.id = $1 and ${vis}`, params);
  return !!rows.rows[0];
}

/** Newest first; contact must be visible else { items: [], next: null }. Default limit 30. */
export async function listActivities(
  viewer: Viewer,
  contactId: string,
  opts?: { limit?: number; before?: string | null },
): Promise<{ items: Activity[]; next: string | null }> {
  if (!(await isContactVisible(viewer, contactId))) return { items: [], next: null };

  const limit = Math.min(200, Math.max(1, Math.floor(Number.isFinite(opts?.limit) ? (opts!.limit as number) : 30)));
  const params: unknown[] = [contactId];
  let where = `a.contact_id = $1`;
  if (opts?.before) {
    where += ` and a.occurred_at < $${params.push(opts.before)}`;
  }

  const rows = await pool.query(
    `select ${activitySelect()}
     from crm_activities a ${activityJoins()}
     where ${where}
     order by a.occurred_at desc, a.id desc
     limit ${limit + 1}`,
    params,
  );

  const hasMore = rows.rows.length > limit;
  const page = hasMore ? rows.rows.slice(0, limit) : rows.rows;
  const next = hasMore ? (page[page.length - 1].occurred_at as string) : null;
  return { items: page as Activity[], next };
}

/** Add a note/call/visit/message/meeting entry; bumps last_activity_at. */
export async function addActivity(
  viewer: Viewer,
  contactId: string,
  input: { kind: Exclude<ActivityKind, 'system'>; body: string; occurred_at?: string },
): Promise<{ id: string }> {
  if ((input.kind as string) === 'system' || !(ACTIVITY_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error('סוג פעילות לא תקין');
  }
  if (!input.body || !input.body.trim()) throw new Error('תוכן חסר');
  if (!(await isContactVisible(viewer, contactId))) throw new Error('איש הקשר לא נמצא');

  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const createdBy = viewer.employeeId || null;
  const rows = await pool.query(
    `insert into crm_activities (contact_id, kind, body, occurred_at, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [contactId, input.kind, input.body.trim(), occurredAt, createdBy],
  );
  await pool.query(
    `update crm_contacts set last_activity_at = greatest(coalesce(last_activity_at, 'epoch'::timestamptz), $2::timestamptz) where id = $1`,
    [contactId, occurredAt],
  );
  return { id: rows.rows[0].id as string };
}

/** Author or admin only; never touches kind 'system'. */
export async function updateActivity(
  viewer: Viewer,
  id: string,
  input: { body?: string; kind?: Exclude<ActivityKind, 'system'>; occurred_at?: string },
): Promise<boolean> {
  const rows = await pool.query(`select kind, created_by from crm_activities where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (row.kind === 'system') return false;
  if (row.created_by !== viewer.employeeId && viewer.role !== 'admin') return false;
  if (input.kind !== undefined && ((input.kind as string) === 'system' || !(ACTIVITY_KINDS as readonly string[]).includes(input.kind))) {
    throw new Error('סוג פעילות לא תקין');
  }
  if (input.body !== undefined && !input.body.trim()) throw new Error('תוכן חסר');

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.body !== undefined) sets.push(`body = $${params.push(input.body.trim())}`);
  if (input.kind !== undefined) sets.push(`kind = $${params.push(input.kind)}`);
  if (input.occurred_at !== undefined) sets.push(`occurred_at = $${params.push(input.occurred_at)}`);
  if (sets.length) {
    const idIdx = params.push(id);
    await pool.query(`update crm_activities set ${sets.join(', ')} where id = $${idIdx}`, params);
  }
  return true;
}

/** Author or admin only; never deletes kind 'system'. */
export async function deleteActivity(viewer: Viewer, id: string): Promise<boolean> {
  const rows = await pool.query(`select kind, created_by from crm_activities where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (row.kind === 'system') return false;
  if (row.created_by !== viewer.employeeId && viewer.role !== 'admin') return false;
  await pool.query(`delete from crm_activities where id = $1`, [id]);
  return true;
}

/** Hebrew sentence describing a kind='system' activity's meta. */
export function describeSystemEvent(meta: Record<string, unknown>): string {
  const event = meta?.event as string | undefined;
  switch (event) {
    case 'created':
      return 'איש הקשר נוצר';
    case 'stage': {
      const from = STAGE_LABELS[meta.from as Stage] ?? String(meta.from ?? '');
      const to = STAGE_LABELS[meta.to as Stage] ?? String(meta.to ?? '');
      return `השלב שונה מ־${from} ל־${to}`;
    }
    case 'family':
      return 'נוסף למשפחה';
    case 'link': {
      const label = LINK_LABELS[meta.type as LinkType] ?? String(meta.type ?? '');
      return `נוסף קשר: ${label}`;
    }
    case 'gift':
      return 'נרשמה תרומה';
    case 'task_done':
      return 'משימה הושלמה';
    default:
      return 'פעולה במערכת';
  }
}
