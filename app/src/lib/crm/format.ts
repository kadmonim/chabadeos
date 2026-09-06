// Pure, island-safe formatting helpers shared by CRM pages and the search island.

/** "ישראל ישראלי" → "יי" (first letters of first + last name, up to 2 chars). */
export function initials(first: string, last?: string | null): string {
  const a = (first ?? '').trim()[0] ?? '';
  const b = (last ?? '').trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

/** 1234.5 → "‏₪1,235" using he-IL grouping, no fraction digits. */
export function fmtMoney(amount: number | null | undefined): string {
  const n = amount ?? 0;
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}
