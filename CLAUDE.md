# Chabad Central

## Database
- This project uses **Supabase** (NOT Neon). Do NOT use Neon MCP tools.
- Connection details are in root `.env` (`SUPABASE_URL`, `SUPABASE_DB_URL`, etc.)
- Migrations live in `supabase/migrations/` and are numbered sequentially (0001, 0002, …)
- To run SQL against the DB: use `docker exec vertlach-db psql "$SUPABASE_DB_SESSION_POOLER_URL"` (the direct DB URL doesn't resolve from inside Docker — use the session pooler URL)
