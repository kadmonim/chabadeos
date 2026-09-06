// Shared reference resolution for the /api/v1/* machine API, so integrations
// can address teams and people by human-readable name instead of ids.
import { sql } from './db';

// Accepts a team id or a team name (case-insensitive). Used by both the
// ?team_id= list filters and the team_id/team_name write fields.
export async function resolveTeamRef(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  const rows = await sql`
    select id from teams where id = ${ref} or name ilike ${ref} limit 1`;
  return (rows[0] as any)?.id ?? null;
}

export async function resolveEmployeeByEmail(email: string): Promise<string | null> {
  const rows = await sql`select id from employees where email ilike ${email}`;
  return (rows[0] as any)?.id ?? null;
}
