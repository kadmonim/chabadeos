// CRM access control: who may use the CRM (crm_users) and what they may see
// (visibilityClause). Kept separate from contacts.ts so it can be imported by
// middleware without pulling in the whole contacts query surface.
import { sql, pool } from '../db';
import type { Viewer, CrmRole, EmployeeRef } from './types';

/** Look up a viewer's CRM role by employee id (crm_users ⨝ system_employees). */
export async function fetchViewer(employeeId: string): Promise<Viewer | null> {
  if (!employeeId) return null;
  const rows = await sql`
    select u.role, e.full_name
    from crm_users u
    join system_employees e on e.id = u.employee_id
    where u.employee_id = ${employeeId}`;
  const row = rows[0] as { role: CrmRole; full_name: string } | undefined;
  if (!row) return null;
  return { employeeId, role: row.role, name: row.full_name };
}

/** Read the viewer middleware already resolved onto locals. */
export function getViewer(locals: App.Locals): Viewer | null {
  return (locals as any).crm ?? null;
}

/** Require a signed-in CRM viewer, else throw a 403 Response. */
export function requireViewer(locals: App.Locals): Viewer {
  const viewer = getViewer(locals);
  if (!viewer) {
    throw new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return viewer;
}

/** Require a CRM admin, else throw a 403 Response. */
export function requireAdmin(locals: App.Locals): Viewer {
  const viewer = requireViewer(locals);
  if (viewer.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return viewer;
}

/** Resolve a viewer from an email address, for the X-On-Behalf-Of machine-API header. */
export async function viewerFromEmail(email: string): Promise<Viewer | null> {
  if (!email) return null;
  const rows = await sql`
    select u.role, e.id, e.full_name
    from crm_users u
    join system_employees e on e.id = u.employee_id
    where e.email ilike ${email}`;
  const row = rows[0] as { role: CrmRole; id: string; full_name: string } | undefined;
  if (!row) return null;
  return { employeeId: row.id, role: row.role, name: row.full_name };
}

/** Full-access viewer for trusted server-to-server callers (e.g. webhooks). */
export const SERVICE_VIEWER: Viewer = { employeeId: '', role: 'admin', name: 'API' };

/** Admins manage everything; members manage what they own. */
export function canManage(viewer: Viewer, contact: { owner_employee_id: string | null }): boolean {
  return viewer.role === 'admin' || (!!viewer.employeeId && contact.owner_employee_id === viewer.employeeId);
}

// Pushes viewer.employeeId onto `params` once (reused for both the owner and
// share checks) and returns a SQL boolean expression for the given alias.
export function visibilityClause(viewer: Viewer, alias: string, params: unknown[]): string {
  if (viewer.role === 'admin') return 'true';
  params.push(viewer.employeeId);
  const n = params.length;
  return `(${alias}.visibility = 'public' or ${alias}.owner_employee_id = $${n} or exists (select 1 from crm_contact_shares s where s.contact_id = ${alias}.id and s.employee_id = $${n}))`;
}

/** All CRM users (for the admin user-management screen), with their role. */
export async function listCrmUsers(): Promise<(EmployeeRef & { role: CrmRole })[]> {
  const rows = await sql`
    select e.id, e.full_name, e.email, u.role
    from crm_users u
    join system_employees e on e.id = u.employee_id
    order by lower(e.full_name)`;
  return rows as (EmployeeRef & { role: CrmRole })[];
}

/** Every system employee, for owner/assignee pickers (not all are CRM users). */
export async function listEmployees(): Promise<EmployeeRef[]> {
  const rows = await sql`select id, full_name, email from system_employees order by lower(full_name)`;
  return rows as EmployeeRef[];
}

/** Grant/change (role) or revoke (role = null) a user's CRM access. */
export async function setCrmUser(employeeId: string, role: CrmRole | null): Promise<void> {
  if (role === null) {
    await pool.query('delete from crm_users where employee_id = $1', [employeeId]);
    return;
  }
  await pool.query(
    `insert into crm_users (employee_id, role) values ($1, $2)
     on conflict (employee_id) do update set role = excluded.role`,
    [employeeId, role],
  );
}
