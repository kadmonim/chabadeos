// Hebrew calendar helpers: pure, no DB import — this module also runs inside
// client:* islands (date pickers, "next occurrence" previews), so it must
// never import anything from db.ts or access.ts.
//
// Note: the real @hebcal/core API puts getBirthdayOrAnniversary/getYahrzeit
// as static methods on `HebrewCalendar`, not on `HDate` — HDate only exposes
// isLeapYear/monthsInYear/daysInMonth/renderGematriya etc as statics/instance
// methods. We import both.
import { HDate, HebrewCalendar } from '@hebcal/core';
import { israelToday } from '../dates';
import type { HebrewDateParts } from './types';

// Strip Hebrew nikud/cantillation marks (renderGematriya() includes them).
const NIKUD_RE = /[֑-ׇ]/g;

const MONTH_LABELS: Record<number, string> = {
  1: 'ניסן',
  2: 'אייר',
  3: 'סיוון',
  4: 'תמוז',
  5: 'אב',
  6: 'אלול',
  7: 'תשרי',
  8: 'חשוון',
  9: 'כסלו',
  10: 'טבת',
  11: 'שבט',
};

function monthLabel(month: number, year: number): string {
  if (month === 12) return HDate.isLeapYear(year) ? 'אדר א׳' : 'אדר';
  if (month === 13) return 'אדר ב׳';
  return MONTH_LABELS[month] ?? String(month);
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error('תאריך לא תקין');
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

// Format a JS Date as 'YYYY-MM-DD' using its local calendar fields — never
// toISOString(), which would shift across UTC and can land on the wrong day.
function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Compare two Dates by calendar day only, ignoring time-of-day.
function beforeDateOnly(a: Date, b: Date): boolean {
  const ax = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bx = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return ax < bx;
}

/** Convert a Gregorian ISO date to Hebrew date parts. afterSunset advances one Hebrew day. */
export function gregToHebrew(iso: string, afterSunset = false): HebrewDateParts {
  const { y, m, d } = parseIso(iso);
  const date = new Date(y, m - 1, d + (afterSunset ? 1 : 0));
  const hd = new HDate(date);
  return { day: hd.getDate(), month: hd.getMonth(), year: hd.getFullYear() };
}

/** Convert Hebrew date parts back to a Gregorian ISO date. Throws on an invalid day/month for that year. */
export function hebrewToGreg(parts: HebrewDateParts): string {
  const maxMonth = HDate.monthsInYear(parts.year);
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > maxMonth) {
    throw new Error('תאריך עברי לא תקין');
  }
  const maxDay = HDate.daysInMonth(parts.month, parts.year);
  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > maxDay) {
    throw new Error('תאריך עברי לא תקין');
  }
  const hd = new HDate(parts.day, parts.month, parts.year);
  return formatIsoDate(hd.greg());
}

/** Hebrew months of `year`, ordered Tishrei → Elul (the order people expect on a picker). */
export function hebrewMonths(year: number): { value: number; label: string }[] {
  const leap = HDate.isLeapYear(year);
  const order = leap ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  return order.map((value) => ({ value, label: monthLabel(value, year) }));
}

export function daysInHebrewMonth(month: number, year: number): number {
  return HDate.daysInMonth(month, year);
}

/** 'י״ד סיוון תשמ״ה' (nikud stripped); pass { year: false } to omit the year. */
export function formatHebrew(parts: HebrewDateParts, opts?: { year?: boolean }): string {
  const hd = new HDate(parts.day, parts.month, parts.year);
  const full = hd.renderGematriya().replace(NIKUD_RE, '');
  if (opts?.year === false) {
    const tokens = full.split(' ');
    tokens.pop();
    return tokens.join(' ');
  }
  return full;
}

/** Next Gregorian occurrence (from `from`, default today) of the Hebrew anniversary of `iso`. */
export function nextAnniversary(iso: string, from: Date = israelToday()): string {
  const { y, m, d } = parseIso(iso);
  const gdate = new Date(y, m - 1, d);
  let hyear = new HDate(from).getFullYear();
  let hit = HebrewCalendar.getBirthdayOrAnniversary(hyear, gdate);
  if (!hit || beforeDateOnly(hit.greg(), from)) {
    hyear += 1;
    hit = HebrewCalendar.getBirthdayOrAnniversary(hyear, gdate);
  }
  if (!hit) throw new Error('תאריך לא תקין');
  return formatIsoDate(hit.greg());
}

/** Next Gregorian occurrence (from `from`, default today) of the yahrzeit of `iso`. */
export function nextYahrzeit(iso: string, from: Date = israelToday()): string {
  const { y, m, d } = parseIso(iso);
  const gdate = new Date(y, m - 1, d);
  let hyear = new HDate(from).getFullYear();
  let hit = HebrewCalendar.getYahrzeit(hyear, gdate);
  if (!hit || beforeDateOnly(hit.greg(), from)) {
    hyear += 1;
    hit = HebrewCalendar.getYahrzeit(hyear, gdate);
  }
  if (!hit) throw new Error('תאריך לא תקין');
  return formatIsoDate(hit.greg());
}

export function hebrewYearNow(): number {
  return new HDate(israelToday()).getFullYear();
}
