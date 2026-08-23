// Hebrew-calendar-first date formatting. Safe on both server and client
// (pure Intl + gematria, no DB imports). Displayed dates show the Jewish date
// first with the Gregorian date in parentheses: י׳ באלול תשפ״ו (23.8.2026).
// Month-level labels (expense billing months) stay Gregorian — Hebrew months
// don't align with billing cycles.
//
// Intl gives us the Hebrew-calendar day/month/year but only with Latin digits
// (the `hebr` numbering system is algorithmic and unsupported by
// Intl.DateTimeFormat in both Node and browsers), so day and year are
// converted to traditional Hebrew numerals here.

const hebParts = new Intl.DateTimeFormat('he-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric',
});
const gregFull = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric', month: 'numeric', year: 'numeric',
});
const gregShort = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric', month: 'numeric',
});

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

// 1..999 → Hebrew numeral with geresh/gershayim (15/16 → ט״ו/ט״ז).
function hebNumeral(n: number): string {
  let s = '';
  let rest = n;
  while (rest >= 100) { s += HUNDREDS[Math.min(4, Math.floor(rest / 100))]; rest -= Math.min(4, Math.floor(rest / 100)) * 100; }
  if (rest === 15) s += 'טו';
  else if (rest === 16) s += 'טז';
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (s.length === 1) return s + '׳'; // geresh: י׳
  return s.slice(0, -1) + '״' + s.slice(-1); // gershayim: תשפ״ו
}

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

// "י׳ באלול תשפ״ו" ({ year: false } → "י׳ באלול")
export function fmtHebrewDate(
  d: string | Date | null | undefined,
  opts: { year?: boolean } = {},
): string {
  const date = toDate(d);
  if (!date) return '';
  const parts = hebParts.formatToParts(date);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0);
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? 0);
  const dayStr = hebNumeral(day);
  if (opts.year === false) return `${dayStr} ב${month}`;
  return `${dayStr} ב${month} ${hebNumeral(year % 1000)}`;
}

// "י׳ באלול תשפ״ו (23.8.2026)"; { year: false } → "י׳ באלול (23.8)"
export function fmtDualDate(
  d: string | Date | null | undefined,
  opts: { year?: boolean } = {},
): string {
  const date = toDate(d);
  if (!date) return '';
  const withYear = opts.year !== false;
  const greg = (withYear ? gregFull : gregShort).format(date);
  return `${fmtHebrewDate(date, opts)} (${greg})`;
}
