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
| GET | `/api/v1/teams` | List teams with members. |
| GET | `/api/v1/rocks` | List non-archived rocks (projects). Optional `?include_archived=1`. |
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
- **Read-only resources** (no POST/PATCH/DELETE): employees, teams, rocks, V/TO.
- No per-key scoping or rate limiting — every valid key gets the full surface. Hand keys only to trusted integrations.
- The UI is Hebrew; the API contract (field names, status values, error strings) is English and stable.

## Environment variables (server side)

| Var | Purpose |
|---|---|
| `CHABADEOS_API_KEYS` | Comma-separated list of valid bearer tokens. Missing → API returns 500. |
| `EOS_API_URL`, `EOS_API_KEY` | Consumer-side convention for clients that call this API. |
