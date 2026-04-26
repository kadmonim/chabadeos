import { supabase } from './supabase';

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

// Access to all /expenses routes (pages + API) is gated to members of the
// "Finance" team. Membership is the single source of truth — add/remove people
// via /teams to change who can review spend.
export function canAccessExpenses(locals: App.Locals): boolean {
  return locals.allowedTeams.some((t) => t.name.trim().toLowerCase() === 'finance');
}

// Method names owned by the current user, via expense_methods.employee_id.
// A card owner who is NOT on Finance still gets scoped access to their own
// method's charges (view, status, notes) — everything else stays Finance-only.
export async function getOwnedMethods(locals: App.Locals): Promise<string[]> {
  const employeeId = locals.user?.employeeId;
  if (!employeeId) return [];
  const { data } = await supabase
    .from('expense_methods')
    .select('name')
    .eq('employee_id', employeeId);
  return (data ?? []).map((m) => m.name);
}

// Can this user view a charge? Finance can see everything; card owners can see
// charges on methods they own.
export async function canViewExpenseMethod(locals: App.Locals, method: string | null): Promise<boolean> {
  if (canAccessExpenses(locals)) return true;
  if (!method) return false;
  const owned = await getOwnedMethods(locals);
  return owned.includes(method);
}

// Given an array of expense_ids, does the user own (or have Finance access to)
// all of them? Used by the APIs before mutating status/notes.
export async function canMutateExpenses(locals: App.Locals, expenseIds: number[]): Promise<boolean> {
  if (expenseIds.length === 0) return false;
  if (canAccessExpenses(locals)) return true;
  const owned = await getOwnedMethods(locals);
  if (owned.length === 0) return false;
  const { data } = await supabase
    .from('expenses')
    .select('expense_id, method')
    .in('expense_id', expenseIds);
  if (!data || data.length !== expenseIds.length) return false;
  return data.every((e) => owned.includes(e.method));
}
