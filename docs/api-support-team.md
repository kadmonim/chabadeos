# EOS API — Support Team Issues & Todos

Focused guide for reading and writing **issues** and **todos** scoped to the **Support** team via the machine API. For the full endpoint catalog see [`api.md`](./api.md).

**Base URL:** `https://your-host/api/v1`

## 1. Auth

Every request sends a bearer token:

```
Authorization: Bearer $EOS_API_KEY
```

Tokens come from the server's `API_KEYS` env var (comma-separated list). Ask an admin for a token; do not commit it. A convenient local setup:

```bash
export EOS_API_URL="https://your-host/api/v1"
export EOS_API_KEY="…"   # supplied out-of-band
```

Smoke-test auth:

```bash
curl -s -H "Authorization: Bearer $EOS_API_KEY" "$EOS_API_URL" | head
```

## 2. Identify the Support team

Writes accept either `team_id` (UUID) or `team_name`; reads accept **only** `team_id`. Fetch the ID once and cache it:

```bash
curl -s -H "Authorization: Bearer $EOS_API_KEY" "$EOS_API_URL/teams" \
  | jq -r '.teams[] | select(.name == "Support") | .id'
```

Store the result as `SUPPORT_TEAM_ID` for the calls below.

> `team_name` matching is case-sensitive. Pass it exactly as `"Support"`.

## 3. Issues on the Support team

Issues are problems / ideas / questions tracked in the IDS list. Each issue has one primary `team_id`; an issue can additionally be *shared* to other teams via `issue_shares`, but the `?team_id=` filter on `GET /api/v1/issues` matches the primary team only.

### List open Support issues

```bash
curl -s -H "Authorization: Bearer $EOS_API_KEY" \
  "$EOS_API_URL/issues?team_id=$SUPPORT_TEAM_ID"
```

Query parameters:

| Param | Values | Default | Notes |
|---|---|---|---|
| `team_id` | UUID | — | Filter to the Support team. |
| `status` | `open`, `solved`, `all` | `open` | Pass `all` to include solved issues. |
| `term` | `short_term`, `long_term` | — | Term bucket. Omit for any. |
| `assignee` / `owner` | email | — | Further narrow to one owner. |

Response shape:

```json
{
  "count": 3,
  "issues": [
    {
      "id": "…",
      "title": "Login page shows stale session banner",
      "description": "…",
      "status": "open",
      "priority": 3,
      "priority_order": 1,
      "type": "problem",
      "term_type": "short_term",
      "created_at": "2026-04-18T09:12:00Z",
      "updated_at": "2026-04-20T14:10:00Z",
      "team": { "id": "…", "name": "Support" },
      "owner": { "id": "…", "name": "Alice Doe", "email": "alice@example.com" }
    }
  ]
}
```

Issues are ordered by `priority_order` ascending (top of the list first).

### Create a Support issue

```bash
curl -s -X POST "$EOS_API_URL/issues" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User reports 500 on password reset",
    "description": "Reproducible from Safari 17. Ticket #4821.",
    "owner_email": "alice@example.com",
    "team_name": "Support",
    "term_type": "short_term",
    "type": "problem",
    "priority": 2
  }'
```

Request body:

| Field | Type | Required | Default |
|---|---|---|---|
| `title` | string | ✅ | — |
| `description` | string | | `null` |
| `owner_email` | string (email) | | unassigned |
| `team_id` **or** `team_name` | string | | unassigned team |
| `term_type` | `short_term` \| `long_term` \| `idea_backlog` | | `short_term` |
| `type` | `problem` \| `idea` \| `question` \| `brainstorm` \| `update` | | `null` |
| `priority` | integer 1–5 | | `3` |

Returns `201 { "id": "<new-issue-id>" }`. Status starts as `open`.

### Mark a Support issue solved / re-open

```bash
# Mark solved (default)
curl -s -X PATCH "$EOS_API_URL/issues" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<issue-id>"}'

# Re-open
curl -s -X PATCH "$EOS_API_URL/issues" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<issue-id>","solved":false}'
```

`PATCH /api/v1/issues` only toggles `status` between `open` and `solved`. To edit title, priority, owner, etc., use the web UI or a form-based endpoint.

## 4. Todos on the Support team

Todos are actionable tasks with an assignee and due date.

### List open Support todos

```bash
curl -s -H "Authorization: Bearer $EOS_API_KEY" \
  "$EOS_API_URL/todos?team_id=$SUPPORT_TEAM_ID"
```

Query parameters:

| Param | Values | Default |
|---|---|---|
| `team_id` | UUID | — |
| `status` | `open`, `done`, `archived`, `all` | `open` |
| `assignee` | email | — |

Response shape:

```json
{
  "count": 2,
  "todos": [
    {
      "id": "…",
      "title": "Reply to Acme Corp ticket backlog",
      "description": null,
      "status": "open",
      "is_urgent": false,
      "due_date": "2026-04-28",
      "created_at": "2026-04-21T12:00:00Z",
      "updated_at": "2026-04-21T12:00:00Z",
      "team": { "id": "…", "name": "Support" },
      "assignee": { "id": "…", "name": "Bob Roe", "email": "bob@example.com" }
    }
  ]
}
```

Ordered by `due_date` ascending; todos without a due date sort last.

### Create a Support todo

```bash
curl -s -X POST "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Draft macro for common auth reset reply",
    "assignee_email": "bob@example.com",
    "team_name": "Support",
    "due_date": "2026-04-30",
    "is_urgent": false
  }'
```

Request body:

| Field | Type | Required | Default |
|---|---|---|---|
| `title` | string | ✅ | — |
| `description` | string | | `null` |
| `assignee_email` | email | | unassigned |
| `team_id` **or** `team_name` | string | | unassigned team |
| `due_date` | `YYYY-MM-DD` | | **today + 7 days** |
| `is_urgent` | boolean | | `false` |

Returns `201 { "id": "<new-todo-id>" }`. Status starts as `open`.

### Update a Support todo

```bash
# Mark done
curl -s -X PATCH "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<todo-id>","done":true}'

# Change due date and reassign
curl -s -X PATCH "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<todo-id>","due_date":"2026-05-05","assignee_email":"carol@example.com"}'

# Unassign (pass empty string or null)
curl -s -X PATCH "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<todo-id>","assignee_email":""}'

# Clear due date
curl -s -X PATCH "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"<todo-id>","due_date":null}'
```

Updatable fields on `PATCH /api/v1/todos`: `done` (toggles status `open` ↔ `done`), `is_urgent`, `due_date`, `assignee_email`. At least one must be provided.

## 5. Error responses

All errors return JSON `{ "error": "…" }` with these status codes:

| Status | Cause |
|---|---|
| `400` | Missing/invalid body, unknown email, team not found, no updatable fields |
| `401` | Missing or invalid `Authorization` header |
| `500` | Server error, or `API_KEYS` env var not configured on the server |

## 6. End-to-end recipe

Open a Support ticket from an external system and assign the triage todo:

```bash
# 1. Resolve the team id once
SUPPORT_TEAM_ID=$(curl -s -H "Authorization: Bearer $EOS_API_KEY" \
  "$EOS_API_URL/teams" | jq -r '.teams[] | select(.name=="Support") | .id')

# 2. File the issue
ISSUE_ID=$(curl -s -X POST "$EOS_API_URL/issues" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Inbound: SSO failing for Acme\",\"team_id\":\"$SUPPORT_TEAM_ID\",\"type\":\"problem\",\"priority\":2}" \
  | jq -r .id)

# 3. Create the triage todo
curl -s -X POST "$EOS_API_URL/todos" \
  -H "Authorization: Bearer $EOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Triage Acme SSO outage (issue $ISSUE_ID)\",\"team_id\":\"$SUPPORT_TEAM_ID\",\"assignee_email\":\"bob@example.com\",\"is_urgent\":true,\"due_date\":\"$(date -I -d '+1 day')\"}"
```

When the work is done:

```bash
curl -s -X PATCH "$EOS_API_URL/todos"  -H "Authorization: Bearer $EOS_API_KEY" -H "Content-Type: application/json" -d "{\"id\":\"<todo-id>\"}"
curl -s -X PATCH "$EOS_API_URL/issues" -H "Authorization: Bearer $EOS_API_KEY" -H "Content-Type: application/json" -d "{\"id\":\"$ISSUE_ID\"}"
```
