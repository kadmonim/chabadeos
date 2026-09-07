// Follow-up tasks. CRM-native (not a generic todo table) so contact
// visibility applies to every read/write.
import { pool } from '../db';
import { visibilityClause } from './access';
import { logSystemActivity } from './contacts';
import type { Viewer, Task } from './types';

function taskSelect(): string {
  return `
    t.id, t.title,
    t.due_date::text as due_date,
    t.done_at::text as done_at,
    json_build_object('id', c.id, 'first_name', c.first_name, 'last_name', c.last_name) as contact,
    case when a.id is null then null else json_build_object('id', a.id, 'full_name', a.full_name, 'email', a.email) end as assignee,
    case when cb.id is null then null else json_build_object('id', cb.id, 'full_name', cb.full_name, 'email', cb.email) end as created_by,
    t.created_at::text as created_at`;
}
function taskJoins(): string {
  return `
    join crm_contacts c on c.id = t.contact_id
    left join system_employees a on a.id = t.assignee_employee_id
    left join system_employees cb on cb.id = t.created_by`;
}
const TASK_ORDER = `order by (t.done_at is null) desc, t.due_date asc nulls last, t.created_at desc`;

async function isContactVisible(viewer: Viewer, contactId: string): Promise<boolean> {
  const params: unknown[] = [contactId];
  const vis = visibilityClause(viewer, 'c', params);
  const rows = await pool.query(`select 1 from crm_contacts c where c.id = $1 and ${vis}`, params);
  return !!rows.rows[0];
}

/** Tasks for one contact; open first (nulls-last due date), then done. */
export async function listTasksForContact(
  viewer: Viewer,
  contactId: string,
  opts?: { includeDone?: boolean },
): Promise<Task[]> {
  if (!(await isContactVisible(viewer, contactId))) return [];

  const params: unknown[] = [contactId];
  let where = `t.contact_id = $1`;
  if (!opts?.includeDone) where += ` and t.done_at is null`;

  const rows = await pool.query(
    `select ${taskSelect()} from crm_tasks t ${taskJoins()} where ${where} ${TASK_ORDER}`,
    params,
  );
  return rows.rows as Task[];
}

/** Tasks assigned to `opts.assignee` (default the viewer; 'all' = every visible contact's tasks). */
export async function listMyTasks(
  viewer: Viewer,
  opts?: { assignee?: string | 'all'; includeDone?: boolean; limit?: number },
): Promise<Task[]> {
  const params: unknown[] = [];
  const vis = visibilityClause(viewer, 'c', params);
  const clauses = [vis];

  const assignee = opts?.assignee ?? viewer.employeeId;
  if (assignee !== 'all') {
    clauses.push(`t.assignee_employee_id = $${params.push(assignee)}`);
  }
  if (!opts?.includeDone) clauses.push(`t.done_at is null`);

  const limit = Math.min(1000, Math.max(1, Math.floor(Number.isFinite(opts?.limit) ? (opts!.limit as number) : 200)));

  const rows = await pool.query(
    `select ${taskSelect()} from crm_tasks t ${taskJoins()}
     where ${clauses.join(' and ')}
     ${TASK_ORDER}
     limit ${limit}`,
    params,
  );
  return rows.rows as Task[];
}

/** Create a task for a contact; default assignee is the viewer. Bumps last_activity_at. */
export async function createTask(
  viewer: Viewer,
  contactId: string,
  input: { title: string; due_date?: string | null; assignee_employee_id?: string | null },
): Promise<{ id: string }> {
  if (!input.title || !input.title.trim()) throw new Error('כותרת חסרה');
  if (!(await isContactVisible(viewer, contactId))) throw new Error('איש הקשר לא נמצא');

  const assignee =
    input.assignee_employee_id !== undefined ? input.assignee_employee_id : viewer.employeeId || null;
  const createdBy = viewer.employeeId || null;

  const rows = await pool.query(
    `insert into crm_tasks (contact_id, title, due_date, assignee_employee_id, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [contactId, input.title.trim(), input.due_date ?? null, assignee, createdBy],
  );
  await pool.query(`update crm_contacts set last_activity_at = now() where id = $1`, [contactId]);
  return { id: rows.rows[0].id as string };
}

/** done:true sets done_at=now() and logs a system activity; done:false clears it. */
export async function updateTask(
  viewer: Viewer,
  id: string,
  input: { title?: string; due_date?: string | null; assignee_employee_id?: string | null; done?: boolean },
): Promise<boolean> {
  const rows = await pool.query(`select contact_id, title from crm_tasks where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (!(await isContactVisible(viewer, row.contact_id))) return false;

  if (input.title !== undefined && !input.title.trim()) throw new Error('כותרת חסרה');

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.title !== undefined) sets.push(`title = $${params.push(input.title.trim())}`);
  if (input.due_date !== undefined) sets.push(`due_date = $${params.push(input.due_date)}`);
  if (input.assignee_employee_id !== undefined) {
    sets.push(`assignee_employee_id = $${params.push(input.assignee_employee_id)}`);
  }
  if (input.done !== undefined) sets.push(`done_at = ${input.done ? 'now()' : 'null'}`);

  if (sets.length) {
    const idIdx = params.push(id);
    await pool.query(`update crm_tasks set ${sets.join(', ')} where id = $${idIdx}`, params);
  }

  if (input.done === true) {
    await logSystemActivity(row.contact_id, viewer, { event: 'task_done', title: row.title });
  }
  return true;
}

export async function deleteTask(viewer: Viewer, id: string): Promise<boolean> {
  const rows = await pool.query(`select contact_id from crm_tasks where id = $1`, [id]);
  const row = rows.rows[0];
  if (!row) return false;
  if (!(await isContactVisible(viewer, row.contact_id))) return false;

  await pool.query(`delete from crm_tasks where id = $1`, [id]);
  return true;
}

/** For the shell badge: open tasks assigned to the viewer over visible contacts, and how many are overdue. */
export async function countOpenTasks(viewer: Viewer): Promise<{ mine: number; overdue: number }> {
  const params: unknown[] = [];
  const assigneeIdx = params.push(viewer.employeeId);
  const vis = visibilityClause(viewer, 'c', params);

  const rows = await pool.query(
    `select
       count(*) filter (where t.done_at is null)::int as mine,
       count(*) filter (where t.done_at is null and t.due_date < current_date)::int as overdue
     from crm_tasks t join crm_contacts c on c.id = t.contact_id
     where t.assignee_employee_id = $${assigneeIdx} and ${vis}`,
    params,
  );
  const row = rows.rows[0] ?? {};
  return { mine: row.mine ?? 0, overdue: row.overdue ?? 0 };
}
