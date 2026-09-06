import { sql } from './db';

// Per-user UI preferences, stored as jsonb on employees.ui_prefs.
// Missing keys mean "default" (shown).
export type UiPrefs = {
  hide_vto?: boolean;
  hide_scorecard?: boolean;
  hide_rooms?: boolean;
  // Opt-in (default hidden), so absence means "hidden".
  show_org_chart?: boolean;
};

export async function getUiPrefs(employeeId: string): Promise<UiPrefs> {
  const rows = await sql`select ui_prefs from employees where id = ${employeeId}`;
  return (rows[0]?.ui_prefs ?? {}) as UiPrefs;
}

export async function setUiPrefs(employeeId: string, prefs: UiPrefs): Promise<void> {
  await sql`update employees set ui_prefs = ${JSON.stringify(prefs)}::jsonb where id = ${employeeId}`;
}
