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
| GET | `/api/v1/issues` | Optional `?assignee=<email>`, `?team_id=`, `?status=`, `?term=short_term\|long_term\|idea_backlog`. |
| POST | `/api/v1/issues` | Create an issue. |
| PATCH | `/api/v1/issues` | Mark an issue solved/open. |
| GET | `/api/v1/issues/:id/shares` | List teams an issue is shared with. |
| POST | `/api/v1/issues/:id/shares` | Share an issue with a team. Body: `{ team_id }` or `{ team_name }`. |
| DELETE | `/api/v1/issues/:id/shares` | Unshare. Body: `{ team_id }` or `{ team_name }`. |
| GET | `/api/v1/todos` | Optional `?assignee=<email>`, `?team_id=`, `?status=open\|done\|archived\|all` (default `open`). |
| POST | `/api/v1/todos` | Create a todo. |
| PATCH | `/api/v1/todos` | Mark a todo done/open. |
| GET | `/api/v1/feature-ideas` | Optional `?owner=<email>` (or `?assignee=`), `?status=`, `?term=`, `?tag=`. |
| POST | `/api/v1/feature-ideas` | Create a feature idea. |
| PATCH | `/api/v1/feature-ideas` | Update a feature idea. |
| GET | `/api/v1/org-seats` | Org chart as a nested tree. `?flat=1` for a flat list. |
| POST | `/api/v1/org-seats` | Create a seat. |
| PATCH | `/api/v1/org-seats` | Update a seat, or move it under a different parent. |
| DELETE | `/api/v1/org-seats` | Delete a seat. Needs `cascade` if it has reports. |
| GET | `/api/v1/vto` | Get the singleton V/TO (vision + traction + SWOT). |

Note: feature ideas no longer have a UI page — the API remains for integrations.

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
{ "id": "…", "solved": true }
```

`solved` defaults to `true` if omitted.

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
{ "id": "…", "done": true }
```

`done` defaults to `true`. Also accepts `is_urgent`, `due_date`, `assignee_email` (set `""`/`null` to clear).

**`POST /api/v1/feature-ideas`**

```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "owner_email": "alice@example.com",
  "term_type": "short_term | long_term | idea_backlog",
  "priority": 3,
  "tags": ["ui", "mobile"]
}
```

Returns `{ "id": "…" }`.

**`PATCH /api/v1/feature-ideas`**

```json
{ "id": "…", "solved": true, "status": "open|solved|archived", "tags": ["…"] }
```

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
- Anywhere a path takes `:id` for a team, a team *name* works too.
- No per-key scoping or rate limiting — every valid key gets the full surface. Hand keys only to trusted integrations.
- The UI is Hebrew; the API contract (field names, status values, error strings) is English and stable.

## Environment variables (server side)

| Var | Purpose |
|---|---|
| `CHABADEOS_API_KEYS` | Comma-separated list of valid bearer tokens. Missing → API returns 500. |
| `EOS_API_URL`, `EOS_API_KEY` | Consumer-side convention for clients that call this API. |
