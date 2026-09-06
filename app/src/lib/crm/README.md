# CRM module — service contract

All CRM SQL lives in `src/lib/crm/*.ts`. Pages (`src/pages/crm/**`), the internal
API (`src/pages/api/crm/*`) and the machine API (`src/pages/api/v1/crm/**`) are
thin callers. Every service function takes a `Viewer` (see `types.ts`) and
enforces visibility inside its query — never bypass it.

## Access (`access.ts`)

```ts
fetchViewer(employeeId: string): Promise<Viewer | null>   // crm_users ⨝ system_employees
getViewer(locals: App.Locals): Viewer | null              // returns locals.crm (set by middleware)
requireViewer(locals): Viewer                             // throws a 403 Response if null
requireAdmin(locals): Viewer                              // throws 403 unless role = admin
viewerFromEmail(email: string): Promise<Viewer | null>    // for X-On-Behalf-Of
SERVICE_VIEWER: Viewer                                    // { employeeId: '', role: 'admin', name: 'API' }
canManage(viewer, contact: { owner_employee_id: string | null }): boolean  // admin or owner
visibilityClause(viewer, alias: string, params: unknown[]): string
  // pushes params, returns e.g. "(c.visibility = 'public' or c.owner_employee_id = $3 or exists (...))"
  // admins get "true".
listCrmUsers(): Promise<(EmployeeRef & { role: CrmRole })[]>
listEmployees(): Promise<EmployeeRef[]>                   // all system_employees, for pickers
setCrmUser(employeeId: string, role: CrmRole | null): Promise<void>  // null removes
```

## Phone (`phone.ts`) — pure, island-safe

```ts
normalizePhone(input: string | null | undefined): { e164: string | null; display: string | null }
  // Israeli default: "050-123 4567" → { e164: '+972501234567', display: '050-123-4567' }
  // "+1 212 555 0100" → { e164: '+12125550100', display: '+1 212-555-0100' }
  // garbage → { e164: null, display: input.trim() || null }
whatsappUrl(e164: string): string   // https://wa.me/972501234567
telUrl(e164: string): string        // tel:+972501234567
```

## Contacts (`contacts.ts`)

```ts
listContacts(viewer, filter: ContactFilter, opts?: {
  sort?: ContactSort; dir?: 'asc' | 'desc'; limit?: number; after?: string | null;
}): Promise<Page<ContactSummary>>            // keyset pagination, default sort 'name' asc, limit 50
searchContacts(viewer, q: string, limit?: number): Promise<ContactSummary[]>
  // pg_trgm similarity on name + ilike on phone/email digits; best first; limit 20
getContact(viewer, id: string): Promise<ContactDetail | null>   // null when missing or not visible
findDuplicate(phoneE164: string | null, email: string | null): Promise<ContactSummary | null>
createContact(viewer, input: ContactInput, opts?: { force?: boolean }):
  Promise<{ id: string } | { duplicate: ContactSummary }>
  // normalises phone; without force, a phone/email match returns { duplicate }
  // sets owner_employee_id = viewer.employeeId when not given (and viewer.employeeId !== '')
  // logs a 'system' activity { event: 'created' }
updateContact(viewer, id: string, input: ContactInput): Promise<boolean>
  // false when not visible. visibility/owner changes require canManage.
  // stage change logs a 'system' activity { event: 'stage', from, to }
archiveContact(viewer, id: string, archived?: boolean): Promise<boolean>   // canManage only
setShares(viewer, id: string, employeeIds: string[]): Promise<boolean>     // canManage only; replaces list
logSystemActivity(contactId: string, viewer, meta: Record<string, unknown>, body?: string): Promise<void>
  // inserts crm_activities kind='system' and bumps crm_contacts.last_activity_at
```

Errors: throw `Error` with a Hebrew message for user-facing validation
(`'שם פרטי חסר'`), callers render it. Not-visible = `null`/`false`, never an error.

## Conventions

- Queries: `sql` tagged template for static SQL, `pool.query(text, params)` with
  `$n` placeholders for dynamic where/order (see `src/lib/db.ts`).
- Employee refs are selected as `json_build_object('id', e.id, 'full_name', e.full_name, 'email', e.email)`.
- Dates come back as `YYYY-MM-DD` strings; timestamps as ISO strings (`::text` or driver default).
- Tables: `crm_contacts`, `crm_households`, `crm_contact_shares`, `crm_links`,
  `crm_activities`, `crm_tasks`, `crm_tags`, `crm_contact_tags`, `crm_saved_lists`,
  `crm_campaigns`, `crm_gifts`, `crm_contact_dates`, `crm_users`; shared
  `system_employees`. Schema: `netlify/database/migrations/20260906232000_crm-foundation/`.
