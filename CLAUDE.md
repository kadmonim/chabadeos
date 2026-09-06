# Chabad Central

Production: https://eos.karmiel.co.il — Netlify site `chabad-central`, deploys from GitHub `kadmonim/chabadeos` (base dir `app/`). Pushing to `main` deploys.

## Database
- This project uses **Netlify DB** (managed Postgres, built into Netlify). It replaced Supabase in Aug 2026; do NOT use Neon MCP tools or supabase-js.
- App code queries through `app/src/lib/db.ts` (`sql` tagged template / `pool` from `@netlify/database`). Server-only — never import it from a `client:*` island.
- `NETLIFY_DB_URL` is injected automatically (by `netlify dev` locally → local dev database; by Netlify in production). Never set it in `.env` — even an empty value shadows the injected one.
- Migrations live in `app/netlify/database/migrations/` and are applied automatically on deploy. Locally: `netlify database migrations new -d "desc"` to create, `netlify database migrations apply` to apply. The old `supabase/migrations/` dir is historical (squashed into the baseline migration); don't add to it.
- Run the `netlify` CLI from `app/` — that's the Netlify project root (`app/.netlify` holds the site link).
- Ad-hoc SQL: `netlify database connect --query "select ..."` (local dev DB; it prints the local connection URL, useful for running `scripts/seed-*.mjs` via `NETLIFY_DB_URL=<url> node scripts/seed-basic.mjs`).
- Local dev: `netlify dev` from `app/` (proxies Astro on http://localhost:8888 and starts the local database). Plain `astro dev` has no DB.
