# Chabad Central API — Third-Party Integration

**Base URL:** `https://eos.karmiel.co.il/api/v1` (locally under `netlify dev`: `http://localhost:8888/api/v1`)

## Authentication

Every request must send:

```
Authorization: Bearer <API_KEY>
```

Valid keys come from the `CHABADEOS_API_KEYS` environment variable on the server — a comma-separated list of allowed tokens. Each third-party consumer should get its own key (`openssl rand -hex 32`) so access can be revoked independently.

## Discovery

`GET /api/v1` returns a JSON catalog of every available endpoint. Start there to sanity-check your auth and see the current surface.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees` | List employees. Optional `?email=` filter. |
| POST | `/api/v1/employees` | Create an employee, optionally adding them to a team. |
| PATCH | `/api/v1/employees` | Rename an employee or change their email. |
| GET | `/api/v1/teams` | List teams with members. |
| POST | `/api/v1/teams` | Create a team, optionally with its starting members. |
| PATCH | `/api/v1/teams` | Rename a team or change its description. |
| DELETE | `/api/v1/teams` | Delete a team. Requires `confirm_name`. |
| GET | `/api/v1/teams/:id/members` | List a team's members. `:id` accepts a team id **or** name. |
| POST | `/api/v1/teams/:id/members` | Add someone to a team. |
| DELETE | `/api/v1/teams/:id/members` | Remove someone from a team. |
| GET | `/api/v1/rocks` | List non-archived rocks (projects). Optional `?include_archived=1`. |
| POST | `/api/v1/rocks` | Create a rock (project). |
| PATCH | `/api/v1/rocks` | Update a rock — including archiving it. |
| GET | `/api/v1/issues` | Optional `?assignee=<email>`, `?team=` (id **or** name), `?status=`, `?term=short_term\|long_term\|idea_backlog`. |
| POST | `/api/v1/issues` | Create an issue. |
| PATCH | `/api/v1/issues` | Update an issue — including moving it to another team. |
| GET | `/api/v1/issues/:id/shares` | List teams an issue is shared with. |
| POST | `/api/v1/issues/:id/shares` | Share an issue with a team. Body: `{ team_id }` or `{ team_name }`. |
| DELETE | `/api/v1/issues/:id/shares` | Unshare. Body: `{ team_id }` or `{ team_name }`. |
| GET | `/api/v1/todos` | Optional `?assignee=<email>`, `?team=` (id **or** name), `?status=open\|done\|archived\|all` (default `open`). |
| POST | `/api/v1/todos` | Create a todo. |
| PATCH | `/api/v1/todos` | Update a todo — including moving it to another team. |
| GET | `/api/v1/crm/contacts` | List CRM contacts. Filters, sorting and cursor pagination — see [CRM](#crm). |
| POST | `/api/v1/crm/contacts` | Create a CRM contact. Rejects phone/email duplicates unless `force`. |
| GET | `/api/v1/crm/contacts/:id` | Get a contact, with computed `phone_links`. |
| PATCH | `/api/v1/crm/contacts/:id` | Update a contact — fields, owner, shares, archived. |
| DELETE | `/api/v1/crm/contacts/:id` | Archive a contact. |
| GET | `/api/v1/crm/search` | Fuzzy contact search by name, phone or email. |
| GET | `/api/v1/rooms` | List bookable rooms. |
| GET | `/api/v1/bookings` | Room bookings as dated occurrences. `?from=&to=` (default this week), `?room=` (id **or** name), `?purpose=`, `?include_cancelled=1`. |
| POST | `/api/v1/bookings` | Book a room, once or weekly. Double bookings are rejected with `409`. |
| PATCH | `/api/v1/bookings` | Edit one occurrence (`id`) or a whole weekly series (`series_id`). |
| DELETE | `/api/v1/bookings` | Cancel an occurrence (`id`) or stop a series (`series_id`). |
| GET | `/api/v1/org-seats` | Org chart as a nested tree. `?flat=1` for a flat list. |
| POST | `/api/v1/org-seats` | Create a seat. |
| PATCH | `/api/v1/org-seats` | Update a seat, or move it under a different parent. |
| DELETE | `/api/v1/org-seats` | Delete a seat. Needs `cascade` if it has reports. |
| GET | `/api/v1/vto` | Get the singleton V/TO (vision + traction + SWOT). |

### Write bodies

**`POST /api/v1/issues`**

```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "owner_email": "alice@example.com",
  "team_id": "…",
  "team_name": "Finance",
  "term_type": "short_term | long_term | idea_backlog (default short_term)",
  "type": "string (optional)",
  "priority": 1
}
```

Returns `{ "id": "…" }`. `team_id` and `team_name` are mutually exclusive.

**`PATCH /api/v1/issues`**

```json
{
  "id": "…",
  "solved": true,
  "status": "open | solved | archived",
  "title": "…",
  "description": "…",
  "team_name": "תפילות",
  "team_id": "…",
  "owner_email": "alice@example.com",
  "term_type": "short_term | long_term | idea_backlog",
  "type": "problem | idea | question | brainstorm | update",
  "priority": 3
}
```

Every field except `id` is optional. Sending only `{ "id": … }` marks the issue solved, as before.

**Moving an issue between teams** is `{"id": …, "team_name": "…"}`. This keeps the issue's id, created date, comments and shares — recreating it under the new team instead would lose all of that. Pass `null` to leave it unassigned. Note that *sharing* an issue with a team does not make it appear under that team's list; only reassigning `team_id` does.

**`POST /api/v1/employees`**

```json
{
  "full_name": "string (required)",
  "email": "alice@example.com (required, unique)",
  "team_id": "…",
  "team_name": "Finance",
  "role": "admin | member (default member)"
}
```

Returns `{ "id": "…", "team_id": … }`. `team_id`/`team_name` are optional — pass one to also add the new person to that team. A duplicate email returns `409` along with the id of the existing employee.

**`PATCH /api/v1/employees`**

```json
{ "id": "…", "email": "old@example.com", "full_name": "New Name", "new_email": "new@example.com" }
```

Identify the person with either `id` or `email`; then send `full_name` and/or `new_email`. There is no DELETE — removing an employee would cascade to their assignments, so do it from the UI deliberately.

**`POST /api/v1/teams`**

```json
{
  "name": "string (required, unique)",
  "description": "string (optional)",
  "members": [
    { "email": "alice@example.com", "role": "admin", "role_description": "Team lead" }
  ]
}
```

Returns `{ "id": "…", "members_added": n }`. `members` is optional; every email in it is checked before the team is created, so a typo fails cleanly instead of leaving a half-populated team. A duplicate name returns `409` with the existing id.

**`PATCH /api/v1/teams`**

```json
{ "team_name": "Finance", "name": "Finance & Ops", "description": "…" }
```

Identify the team with `id` or `team_name`.

**`DELETE /api/v1/teams`**

```json
{ "team_name": "Finance", "confirm_name": "Finance" }
```

`confirm_name` must match the team's exact name (case-sensitive) — a guard against deleting the wrong team. Memberships are deleted with it; issues, todos and scorecard items survive but lose their team assignment.

**`POST /api/v1/teams/:id/members`**

```json
{ "email": "alice@example.com", "role": "member", "role_description": "Bookkeeping" }
```

`:id` may be a team id or a team name. Use `employee_id` instead of `email` if you have it. Idempotent — posting again for the same person updates their role rather than erroring.

**`DELETE /api/v1/teams/:id/members`**

```json
{ "email": "alice@example.com" }
```

Returns `204`, or `404` if that person wasn't on the team.

**`POST /api/v1/rocks`**

```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "owner_email": "alice@example.com",
  "due_date": "2026-12-31",
  "status": "on_track | off_track | done (default on_track)",
  "priority_order": 0
}
```

Returns `{ "id": "…" }`. Rocks are org-wide, not team-scoped, so there is no `team_id`.

**`PATCH /api/v1/rocks`**

```json
{
  "id": "…",
  "title": "…",
  "description": "…",
  "owner_email": "alice@example.com",
  "due_date": "2026-12-31",
  "status": "on_track | off_track | done",
  "priority_order": 3,
  "is_archived": false
}
```

Every field except `id` is optional — only what you send is changed. Pass `""` or `null` for `owner_email`, `due_date` or `description` to clear them. There is no DELETE; retire a rock with `{"is_archived": true}`. Returns the fields that were applied, or `404` if the id doesn't exist.

**`POST /api/v1/todos`**

```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "assignee_email": "alice@example.com",
  "team_id": "…",
  "team_name": "Finance",
  "due_date": "2026-04-20",
  "is_urgent": false
}
```

Returns `{ "id": "…" }`. New todos start in `open` status. `team_id` / `team_name` are mutually exclusive.

**`PATCH /api/v1/todos`**

```json
{
  "id": "…",
  "done": true,
  "status": "open | done | archived",
  "title": "…",
  "description": "…",
  "is_urgent": false,
  "due_date": "2026-04-20",
  "assignee_email": "alice@example.com",
  "team_name": "תפילות"
}
```

Every field except `id` is optional. Set `""`/`null` to clear `assignee_email`, `due_date`, `description` or the team. Reassigning the team moves the todo while keeping its id and history.

**`POST /api/v1/org-seats`**

```json
{
  "title": "string (required)",
  "parent_title": "Director of Operations",
  "parent_id": "…",
  "employee_email": "alice@example.com",
  "person_name": "Someone not in the system",
  "responsibilities": ["Budget", "Vendor contracts"],
  "display_order": 0
}
```

Returns `{ "id": … }`. Omit the parent for a top-level seat. A seat's occupant is either a linked employee (`employee_email`) or free text (`person_name`) — linking is preferable, since the name then follows the employee record. `responsibilities` also accepts a newline-separated string.

**`PATCH /api/v1/org-seats`**

```json
{ "title": "Bookkeeper", "new_title": "Controller", "parent_title": "CFO", "responsibilities": ["…"] }
```

Identify the seat with `id` or `title`; use `new_title` to rename it. Setting `parent_id`/`parent_title` moves the seat — pass `null` to move it to the top level. Moving a seat under one of its own descendants is rejected, since it would detach that branch from the chart.

**`DELETE /api/v1/org-seats`**

```json
{ "title": "Bookkeeper", "cascade": false }
```

Deleting a seat deletes every seat beneath it. If it has reports, the call is refused with `409` and the descendant count until you resend with `"cascade": true`.

### Room bookings

`GET /api/v1/bookings` returns real dated slots, already expanded — you never have to interpret a recurrence rule:

```json
{
  "from": "2026-08-23", "to": "2026-08-29",
  "bookings": [
    {
      "id": "…", "room": { "id": "…", "name": "חלל פנימי גדול" },
      "date": "2026-08-24", "start_time": "19:00", "end_time": "20:30",
      "title": "שיעור תניא", "in_charge_name": "הרב כהן",
      "purpose": "class", "notes": null,
      "weekly": true, "series_id": "…", "is_cancelled": false
    }
  ],
  "count": 1
}
```

**`POST /api/v1/bookings`**

```json
{
  "room": "חלל פנימי גדול",
  "title": "שיעור תניא",
  "in_charge_name": "הרב כהן",
  "date": "2026-08-24",
  "start_time": "19:00",
  "end_time": "20:30",
  "purpose": "class",
  "notes": "optional",
  "weekly": false,
  "ends_on": "2027-06-30"
}
```

`purpose` is what the space is being used for, one of `class` (שיעור), `meeting` (פגישה), `chavrusa` (חברותא), `work` (עבודה), `youth` (פעילות נוער), `other` (אחר). It's optional; anything else is rejected with `400`.

`room` takes an id or an exact room name. `in_charge_name` is free text — the person running it doesn't have to be in the system. Times are Jerusalem wall-clock and the range is half-open, so an event ending at 20:00 doesn't clash with one starting at 20:00.

A clash is a hard failure, never a merge: the response is `409` with the blocking booking, e.g. `{ "error": "חלל פנימי גדול תפוס בשעה הזו — שיעור תניא (19:00–20:30), באחריות הרב כהן.", "conflict": { … } }`.

With `"weekly": true` the `date` sets the weekday and the first occurrence; slots are materialised through a rolling six-month horizon and returned as `{ "series_id": …, "weekday": 1, "skipped_dates": [] }`. Dates already taken by something else appear in `skipped_dates` rather than failing the whole series.

**`PATCH /api/v1/bookings`** — one occurrence:

```json
{ "id": "…", "date": "2026-08-25", "start_time": "19:30", "end_time": "21:00", "is_cancelled": false }
```

Editing a single occurrence marks it as an exception, so later series-wide edits leave it alone.

**`PATCH /api/v1/bookings`** — a whole series:

```json
{
  "series_id": "…", "title": "…", "in_charge_name": "…", "room": "שולחן עגול - לובי",
  "purpose": "class", "weekday": 2, "start_time": "19:00", "end_time": "20:30",
  "effective_from": "2026-09-01", "is_active": true
}
```

`weekday` is 0 = Sunday through 6 = Saturday. `effective_from` (default today) is the point from which the change applies: earlier occurrences stay as they happened, so moving a class from Monday to Tuesday doesn't rewrite history. `"is_active": false` stops the series.

**`DELETE /api/v1/bookings`**

```json
{ "id": "…" }
```

For a series occurrence this cancels that one week (the slot stays reserved as a tombstone so it isn't regenerated); a one-off is deleted outright. `{ "series_id": "…" }` stops the whole series — future occurrences go, past ones remain as history.

## CRM

The CRM tracks contacts (people the shul knows — members, donors, regulars).
API keys act as a trusted **admin service account** by default. Send

```
X-On-Behalf-Of: alice@example.com
```

to narrow visibility to that CRM user (they only see contacts they own,
that are public, or that are shared with them) and to attribute writes
(owner defaults, activity log) to them instead of the service account. The
email must belong to an existing CRM user, or the request fails with `400`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/crm/contacts` | List contacts. |
| POST | `/api/v1/crm/contacts` | Create a contact. |
| GET | `/api/v1/crm/contacts/:id` | Get one contact. |
| PATCH | `/api/v1/crm/contacts/:id` | Update a contact. |
| DELETE | `/api/v1/crm/contacts/:id` | Archive a contact. |
| GET | `/api/v1/crm/search` | Fuzzy search. |
| GET | `/api/v1/crm/households` | List families ("households"). |
| POST | `/api/v1/crm/households` | Create a family. |
| GET | `/api/v1/crm/households/:id` | Get a family, with its members. |
| PATCH | `/api/v1/crm/households/:id` | Update a family. |
| POST | `/api/v1/crm/households/:id/members` | Add/move a contact into a family. |
| DELETE | `/api/v1/crm/households/:id/members` | Remove a contact from a family. |
| GET | `/api/v1/crm/contacts/:id/links` | List a contact's links. |
| POST | `/api/v1/crm/contacts/:id/links` | Link two contacts. |
| DELETE | `/api/v1/crm/contacts/:id/links` | Remove a link. |
| PUT | `/api/v1/crm/contacts/:id/tags` | Replace a contact's tags. |
| POST | `/api/v1/crm/contacts/:id/tags` | Add a tag to a contact. |
| DELETE | `/api/v1/crm/contacts/:id/tags` | Remove a tag from a contact. |
| GET | `/api/v1/crm/tags` | List tags. |
| POST | `/api/v1/crm/tags` | Create a tag (admin only). |

### Stages

`new` (חדש), `acquaintance` (מכר), `regular` (קבוע), `member` (חבר קהילה),
`donor` (תורם), `inactive` (לא פעיל).

### `GET /api/v1/crm/contacts`

Query params: `q` (fuzzy name/phone/email), `stage` (comma-separated, e.g.
`donor,member`), `tag` (id or name), `owner` (email — resolved to an
employee; an unknown email returns an empty result rather than an error),
`household` (id), `visibility` (`public` | `restricted`), `updated_since`
(ISO timestamp), `archived=1` (include archived contacts, default excluded),
`sort` (`name` | `updated` | `created` | `last_activity` | `stage`, default
`name`), `dir` (`asc` | `desc`), `limit` (default 50), `after` (cursor from
the previous page's `next`).

```json
{
  "contacts": [ { "id": "…", "first_name": "…", "last_name": "…", "stage": "donor", "…": "…" } ],
  "count": 50,
  "total": 214,
  "next": "eyJ…"
}
```

Pass `next` back as `after` to fetch the following page; `next` is `null` on
the last page.

**`POST /api/v1/crm/contacts`**

```json
{
  "first_name": "Alice",
  "last_name": "Cohen",
  "phone": "050-123 4567",
  "email": "alice@example.com",
  "stage": "new",
  "owner_email": "gabbai@example.com",
  "visibility": "public",
  "force": false
}
```

`owner_email` replaces `owner_employee_id` on the wire (resolved server-side;
an unknown email is `400`). Phone is normalised (Israeli by default) and
checked against existing contacts by phone/email; a match returns:

```json
{ "error": "duplicate", "existing": { "id": "…" } }
```

with status `409`. Pass `"force": true` (or `?force=1`) to create anyway.
Validation failures (e.g. missing name) return `400 { "error": "<message>" }`.
On success: `201 { "id": "…" }`.

**`GET /api/v1/crm/contacts/:id`**

Returns `404 { "error": "not found" }` if missing or not visible to the
caller. Otherwise `{ "contact": { …ContactDetail, "phone_links": { "tel": "tel:+972501234567", "whatsapp": "https://wa.me/972501234567" } } }` — `phone_links` is `{ "tel": null, "whatsapp": null }` when there's no phone.

**`PATCH /api/v1/crm/contacts/:id`**

```json
{
  "stage": "donor",
  "owner_email": "gabbai@example.com",
  "visibility": "restricted",
  "shares": ["alice@example.com", "bob@example.com"],
  "archived": false
}
```

Every field is optional; `owner_email` and `shares` resolve emails to
employees server-side (unknown email → `400`). `shares` replaces the full
share list for restricted contacts. `archived` toggles the archive flag.
Returns `204` on success, `404` if the contact doesn't exist or isn't
visible to the caller, or `403 { "error": "<Hebrew message>" }` if the
caller lacks permission to manage the contact (only the owner or an admin
may change owner, visibility, shares or archive status).

**`DELETE /api/v1/crm/contacts/:id`** — archives the contact (soft delete).
`204` on success, `404` if not found/visible.

**`GET /api/v1/crm/search`** — `?q=` (required) and `?limit=` (default 20).
Fuzzy-matches name/Hebrew name, and exact-matches digits of phone/email.

```json
{ "contacts": [ { "id": "…", "first_name": "…", "last_name": "…", "…": "…" } ] }
```

### Families

The CRM groups contacts into families ("households" internally — the UI
label and this API use "family"/"household" interchangeably; the table is
`crm_households`). A family has an address (street/city/postal_code) shared
by its members, and each member has a `household_role`: `head` (ראש משק
בית), `spouse` (בן/בת זוג), `child` (ילד/ה), `other` (אחר).

**`GET /api/v1/crm/households`** — `?q=` (ilike on name/city/street), `?limit=`
(default 50), `?after=` (cursor from a previous page's `next`). Only families
with at least one member visible to the caller are returned (admins see all).

```json
{
  "households": [
    { "id": "…", "name": "משפחת כהן", "street": "…", "city": "…", "postal_code": "…",
      "member_count": 4, "heads": ["דוד כהן", "רבקה כהן"], "updated_at": "…" }
  ],
  "count": 20,
  "total": 88,
  "next": "eyJ…"
}
```

**`POST /api/v1/crm/households`**

```json
{
  "name": "משפחת כהן",
  "street": "הרצל 12",
  "city": "כרמיאל",
  "postal_code": "…",
  "notes": "optional",
  "owner_email": "gabbai@example.com"
}
```

`name` is required. `owner_email` resolves to an employee server-side
(unknown email → `400`). Returns `201 { "id": "…" }`.

**`GET /api/v1/crm/households/:id`** — `404 { "error": "not found" }` if
missing or no member is visible to the caller. Otherwise
`{ "household": { …family fields, "notes", "owner", "members": [ …ContactSummary + household_role, ordered head, spouse, child (by birthdate), other ], "gift_total", "gift_count" } }`.

**`PATCH /api/v1/crm/households/:id`** — body: same fields as `POST` (all
optional), `owner_email` instead of `owner_employee_id`. `204` on success,
`404` if not found/visible.

**`POST /api/v1/crm/households/:id/members`** — body: `{ "contact_id": "…", "role": "head" | "spouse" | "child" | "other" }`. Moves the contact into this family (out of any previous one). `204` on success, `404` if the contact or family isn't found/visible.

**`DELETE /api/v1/crm/households/:id/members`** — body: `{ "contact_id": "…" }`. Removes the contact from the family. `204` on success.

### Links

Links record relationships between two contacts (spouse, parent/child, employer,
referrals, etc). Each link type has an inverse — creating a link from A→B also
implies the flipped relationship when viewed from B:

| type | label (from `from`) | inverse |
|---|---|---|
| `spouse` | בן/בת זוג | `spouse` |
| `parent` | הורה | `child` |
| `child` | ילד/ה | `parent` |
| `sibling` | אח/אחות | `sibling` |
| `employer` | מעסיק | `employee` |
| `employee` | עובד/ת | `employer` |
| `referred_by` | הופנה על ידי | `referred` |
| `referred` | הפנה את | `referred_by` |
| `friend` | חבר/ה | `friend` |
| `other` | קשר אחר | `other` |

**`GET /api/v1/crm/contacts/:id/links`** — `{ "links": [ { "id": "…", "type": "spouse", "note": null, "contact": { "id": "…", "first_name": "…", "last_name": "…" } } ] }`, already flipped so `type` is as seen from `:id`.

**`POST /api/v1/crm/contacts/:id/links`**

```json
{ "to_contact_id": "…", "type": "spouse", "note": "optional" }
```

Both contacts must be visible to the caller; linking a contact to itself is
`400`. Idempotent — re-posting the same pair/type (or its inverse) returns the
existing link rather than duplicating it. Returns
`201 { "id": "…", "suggest_family": true }` — `suggest_family` is `true` when
`type` is `spouse` and the two contacts aren't already in the same family (a
hint to the caller, not an automatic merge).

**`DELETE /api/v1/crm/contacts/:id/links`** — body: `{ "id": "…" }` (the link
id from `GET`/`POST`). `204` on success, `404` if not found/visible.

### Tags

Tags are short labels with a colour, attachable to any contact.

| colour | pill |
|---|---|
| `stone` | bg-stone-100 text-stone-700 |
| `brand` | bg-brand-soft text-brand-ink |
| `flame` | bg-flame-soft text-flame-ink |
| `emerald` | bg-emerald-100 text-emerald-800 |
| `amber` | bg-amber-100 text-amber-800 |
| `rose` | bg-rose-100 text-rose-800 |
| `sky` | bg-sky-100 text-sky-700 |
| `teal` | bg-teal-100 text-teal-800 |

**`GET /api/v1/crm/tags`** — `{ "tags": [ { "id": "…", "name": "…", "color": "brand", "contact_count": 12 } ] }`.

**`POST /api/v1/crm/tags`** — **admin only**. The service account
(no `X-On-Behalf-Of`) is always admin; with `X-On-Behalf-Of` set to a
non-admin CRM user the call fails with `403`.

```json
{ "name": "תורם קבוע", "color": "amber" }
```

`color` defaults to a service-chosen colour when omitted; must be one of the
table above. `name` must be unique (case-insensitive) or the call fails with
`400`. Returns `201 { "id": "…" }`.

**`PUT /api/v1/crm/contacts/:id/tags`** — body: `{ "tags": ["תורם קבוע", "…tag id…"] }`. Each entry may be a tag id or an exact (case-insensitive) tag name; an unrecognised entry fails the whole call with `400 { "error": "unknown tag(s): …" }` rather than partially applying. Replaces the contact's full tag list. `204` on success, `404` if the contact isn't found/visible.

**`POST /api/v1/crm/contacts/:id/tags`** — body: `{ "tag": "תורם קבוע" }` (id or name). Adds one tag without disturbing the rest. `204` on success.

**`DELETE /api/v1/crm/contacts/:id/tags`** — body: `{ "tag": "תורם קבוע" }` (id or name). Removes one tag. `204` on success.

## Examples

```bash
# Discovery
curl -H "Authorization: Bearer $EOS_API_KEY" https://eos.karmiel.co.il/api/v1

# Create a todo for a user by email
curl -X POST https://eos.karmiel.co.il/api/v1/todos \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Follow up with vendor","assignee_email":"alice@example.com","team_name":"Finance","due_date":"2026-04-20"}'

# List open todos for a user
curl -H "Authorization: Bearer $EOS_API_KEY" \
  "https://eos.karmiel.co.il/api/v1/todos?assignee=alice@example.com&status=open"

# What's booked this week
curl -H "Authorization: Bearer $EOS_API_KEY" https://eos.karmiel.co.il/api/v1/bookings

# Book a room for one evening
curl -X POST https://eos.karmiel.co.il/api/v1/bookings \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"room":"שולחן עגול - לובי","title":"התוועדות","in_charge_name":"הרב כהן","purpose":"other","date":"2026-08-26","start_time":"20:00","end_time":"22:00"}'

# Create a project (rock)
curl -X POST https://eos.karmiel.co.il/api/v1/rocks \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Open the new campus wing","owner_email":"alice@example.com","due_date":"2026-12-31"}'

# Move a project off track
curl -X PATCH https://eos.karmiel.co.il/api/v1/rocks \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<rock-id>","status":"off_track"}'

# Mark a todo done
curl -X PATCH https://eos.karmiel.co.il/api/v1/todos \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<todo-id>"}'
```

## Error format

All errors are JSON:

```json
{ "error": "unauthorized" }
```

| Status | Meaning |
|---|---|
| `401` | Missing or invalid `Authorization` header |
| `400` | Validation error (missing required field, bad id, mutually-exclusive fields both set) |
| `404` | Resource not found (e.g. issue id on the shares endpoints) |
| `500` | Server error, or `CHABADEOS_API_KEYS` not configured |

## Notes & limits

- Responses are pretty-printed JSON with `cache-control: no-store`.
- `team_name` lookups are case-insensitive exact matches.
- **Read-only resources** (no POST/PATCH/DELETE): V/TO.
- Anywhere a team is referenced — `?team=`, `team_id`, `team_name`, or `:id` in a path — a team **name** works as well as a uuid. Names are matched case-insensitively.
- Prefer `PATCH` over delete-and-recreate when moving records between teams: a new record loses the original's id, timestamps and comment history.
- No per-key scoping or rate limiting — every valid key gets the full surface. Hand keys only to trusted integrations.
- The UI is Hebrew; the API contract (field names, status values, error strings) is English and stable.

## Environment variables (server side)

| Var | Purpose |
|---|---|
| `CHABADEOS_API_KEYS` | Comma-separated list of valid bearer tokens. Missing → API returns 500. |
| `EOS_API_URL`, `EOS_API_KEY` | Consumer-side convention for clients that call this API. |
