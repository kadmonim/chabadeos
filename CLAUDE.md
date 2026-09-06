# Chabad Central

Production: https://eos.karmiel.co.il — Netlify site `chabadeos` (account MendyE), deploys from GitHub `kadmonim/chabadeos` (base dir `app/`). Pushing to `main` deploys.

## Database
- This project uses **Netlify DB** (managed Postgres, built into Netlify; Neon-backed under the hood, PostgreSQL 18, full extension catalogue incl. pg_trgm/citext/pg_cron/vector). It replaced Supabase in Aug 2026; do NOT use Neon MCP tools or supabase-js.
- App code queries through `app/src/lib/db.ts` (`sql` tagged template / `pool` from `@netlify/database`). Server-only — never import it from a `client:*` island.
- `NETLIFY_DB_URL` is injected automatically (by `netlify dev` locally → local dev database; by Netlify in production). Never set it in `.env` — even an empty value shadows the injected one.
- Migrations live in `app/netlify/database/migrations/` and are applied automatically on deploy. Locally: `netlify database migrations new -d "desc"` to create, `netlify database migrations apply` to apply. The old `supabase/migrations/` dir is historical (squashed into the baseline migration); don't add to it.
- Table naming: every table is prefixed by feature — `system_*` (employees, teams, team_memberships, settings, links), `eos_*` (rocks, issues, todos, scorecard, vtos, org_seats, processes), `rooms_*` (spaces, bookings, booking_series). New features get their own prefix (e.g. `crm_*`).
- Run the `netlify` CLI from `app/` — that's the Netlify project root (`app/.netlify` holds the site link).
- Production DB: `netlify database status --branch production` shows applied migrations; add `--show-credentials` for the connection string (Team Owner only; a 401 means re-run `netlify login`). The Netlify plan is Pro (30-day backups, sleep-on-inactivity can be disabled).
- Ad-hoc SQL: `netlify database connect --query "select ..."` (local dev DB; it prints the local connection URL, useful for running `scripts/seed-*.mjs` via `NETLIFY_DB_URL=<url> node scripts/seed-basic.mjs`).
- Local dev: `netlify dev` from `app/` (proxies Astro on http://localhost:8888 and starts the local database). Plain `astro dev` has no DB.

## CRM module (`/crm`, tables `crm_*`)
- Plan: `~/.claude/plans/eager-puzzling-sunbeam.md`. Service contract: `app/src/lib/crm/README.md`. All CRM SQL lives in `app/src/lib/crm/*.ts`; pages, `/api/crm/*` (session) and `/api/v1/crm/*` (bearer key) are thin callers.
- Access is standalone (`crm_users`, roles admin/member), not EOS teams. Middleware puts the viewer on `Astro.locals.crm` (null = no access). Contacts are `public` or `restricted` (owner + `crm_contact_shares` + admins). Every query goes through `visibilityClause()`.
- Machine API keys act as an admin service account; `X-On-Behalf-Of: <email>` narrows to that CRM user.
- Design language: HubSpot-style workbench (rail + utility bar shell in `AppLayout`, drawers for create/edit via URL state, cards with header actions, orange accent via `module="crm"`).
