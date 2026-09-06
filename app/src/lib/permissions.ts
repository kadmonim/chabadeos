// Who can edit the V/TO. Keep this short and explicit — if it grows, move to a DB flag.
export const VTO_EDITOR_EMAILS = new Set<string>([
  'mendye@gmail.com',
]);

export function canEditVto(email: string | undefined | null): boolean {
  if (!email) return false;
  return VTO_EDITOR_EMAILS.has(email.toLowerCase());
}

// System admins can manage membership on any team, regardless of whether
// they're a member. Scoping for issues/todos/rocks/etc. still goes through
// allowedTeams — this only affects team-management surfaces.
export const SYSTEM_ADMIN_EMAILS = new Set<string>([
  'mendye@gmail.com',
]);

export function isSystemAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return SYSTEM_ADMIN_EMAILS.has(email.toLowerCase());
}
