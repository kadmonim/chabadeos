// Team visibility = team_memberships. A user can only see/write teams where
// they have a membership row. Resolved once per request in middleware and
// exposed via Astro.locals.

import type { AstroCookies } from 'astro';
import { sql } from './db';
import { isSystemAdmin } from './permissions';

const COOKIE = 'chabad_team';

export type Team = { id: string; name: string; description: string | null };

export async function fetchAllowedTeams(employeeId: string): Promise<Team[]> {
  const data = await sql`
    select case when t.id is null then null
      else json_build_object('id', t.id, 'name', t.name, 'description', t.description)
    end as team
    from team_memberships m
    left join teams t on t.id = m.team_id
    where m.employee_id = ${employeeId}`;
  const teams = ((data ?? []) as any[])
    .map((r) => r.team)
    .filter((t): t is Team => !!t);
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveCurrentTeam(cookies: AstroCookies, allowed: Team[]): Team | null {
  if (allowed.length === 0) return null;
  const stored = cookies.get(COOKIE)?.value;
  return allowed.find((t) => t.id === stored) ?? allowed[0];
}

export function setCurrentTeam(cookies: AstroCookies, teamId: string) {
  cookies.set(COOKIE, teamId, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function canAccessTeam(locals: App.Locals, teamId: string | null | undefined): boolean {
  if (!teamId) return true; // null team_id = no team scoping
  if (isSystemAdmin(locals.user?.email)) return true;
  return locals.allowedTeams.some((t) => t.id === teamId);
}
