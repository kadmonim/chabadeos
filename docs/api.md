# Chabad Central API — Third-Party Integration

**Base URL:** `https://<your-deployment>/api/v1` (locally: `http://localhost:6133/api/v1`)

## Authentication

Every request must send:

```
Authorization: Bearer <API_KEY>
```

Valid keys come from the `API_KEYS` environment variable on the server — a comma-separated list of allowed tokens. Each third-party consumer should get its own key so access can be revoked independently.

## Discovery

`GET /api/v1` returns a JSON catalog of every available endpoint. Start there to sanity-check your auth and see the current surface.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/employees` | List employees. Optional `?email=` filter. |
| GET | `/api/v1/contacts` | Optional `?q=` name search, `?category=`, `?employee_id=`. |
| GET | `/api/v1/teams` | List teams with members. |
| GET | `/api/v1/rocks` | List non-archived rocks with milestones. |
| GET | `/api/v1/issues` | Optional `?assignee=<email>`, `?team_id=`, `?status=`, `?term=short_term\|long_term`. |
| POST | `/api/v1/issues` | Create an issue. |
| PATCH | `/api/v1/issues` | Mark an issue solved/open. |
| GET | `/api/v1/todos` | Optional `?assignee=<email>`, `?team_id=`, `?status=open\|done\|archived\|all` (default `open`). |
| POST | `/api/v1/todos` | Create a todo. |
| PATCH | `/api/v1/todos` | Mark a todo done/open. |
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
  "term_type": "short_term | long_term (default short_term)",
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

`done` defaults to `true`.

## Examples

```bash
# Discovery
curl -H "Authorization: Bearer $EOS_API_KEY" https://your-host/api/v1

# Create a todo for a user by email
curl -X POST https://your-host/api/v1/todos \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Follow up with vendor","assignee_email":"alice@example.com","team_name":"Finance","due_date":"2026-04-20"}'

# List open todos for a user
curl -H "Authorization: Bearer $EOS_API_KEY" \
  "https://your-host/api/v1/todos?assignee=alice@example.com&status=open"

# Mark a todo done
curl -X PATCH https://your-host/api/v1/todos \
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
| `500` | Server error, or `API_KEYS` not configured |

## Notes & limits

- Responses are pretty-printed JSON with `cache-control: no-store`.
- `team_name` lookups are case-sensitive.
- **Read-only resources** (no POST/PATCH/DELETE): employees, contacts, teams, rocks, V/TO.
- **Posts** (the unified updates/testimonials entity) is not exposed on `/api/v1` yet. Open an issue if an integration needs it.

## Environment variables (server side)

| Var | Purpose |
|---|---|
| `API_KEYS` | Comma-separated list of valid bearer tokens. Missing → API returns 500. |
| `EOS_API_URL`, `EOS_API_KEY` | Consumer-side convention for clients that call this API. |
