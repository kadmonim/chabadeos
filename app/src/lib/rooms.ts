// Room availability: shared server-side logic for the /rooms pages and both APIs.
//
// Occurrences are real dated rows, generated from a series through a rolling
// horizon. See the rooms-and-bookings migration for why.

import { sql } from './db';

export const HORIZON_MONTHS = 6;
const TZ = 'Asia/Jerusalem';

export type Room = { id: string; name: string; sort_order: number };

export type Occurrence = {
  id: string;
  series_id: string | null;
  series_date: string | null;
  room_id: string;
  room_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  title: string;
  in_charge_name: string;
  notes: string | null;
  is_modified: boolean;
  is_cancelled: boolean;
  created_by: string | null;
  weekly: boolean;
};

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// The driver wraps query failures in its own Error ("Failed query: …") and keeps
// the Postgres error as the cause, so `e.code` alone misses the real code.
export function pgErrorCode(e: unknown): string | undefined {
  let cur: any = e;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (typeof cur.code === 'string') return cur.code;
    cur = cur.cause;
  }
  return undefined;
}

// 23P01 = the room-overlap exclusion constraint.
export const isOverlapError = (e: unknown) => pgErrorCode(e) === '23P01';

// ---------- dates ----------
// Netlify functions run in UTC, so "today" and "now" must be derived in
// Jerusalem time or the page is wrong for three hours every evening.

export function todayInJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function nowTimeInJerusalem(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

// Dates are handled as plain YYYY-MM-DD strings throughout: no timezone can
// creep in and shift a booking by a day.
export function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCMonth(d.getUTCMonth() + n);
  return isoDate(d);
}

export function weekdayOf(s: string): number {
  return parseDate(s).getUTCDay();
}

// Sunday-start week, matching the Israeli calendar.
export function weekStart(s: string): string {
  return addDays(s, -weekdayOf(s));
}

export function weekDates(anchor: string): string[] {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s).getTime());
}

// Postgres `time` comes back as HH:MM:SS; the UI only ever wants HH:MM.
export function hhmm(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

export function isValidTime(s: string | null | undefined): s is string {
  return !!s && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
}

// ---------- reads ----------

export async function listRooms(): Promise<Room[]> {
  const rows = await sql`
    select id, name, sort_order from rooms
    where is_active order by sort_order, name`;
  return rows as Room[];
}

export async function occurrencesBetween(
  from: string,
  to: string,
  opts: { includeCancelled?: boolean } = {},
): Promise<Occurrence[]> {
  const rows = await sql`
    select
      b.id, b.series_id, b.series_date, b.room_id, r.name as room_name,
      b.event_date::text as event_date, b.start_time::text as start_time,
      b.end_time::text as end_time,
      coalesce(b.title, s.title) as title,
      coalesce(b.in_charge_name, s.in_charge_name) as in_charge_name,
      coalesce(b.notes, s.notes) as notes,
      b.is_modified, b.is_cancelled,
      coalesce(b.created_by, s.created_by) as created_by,
      (b.series_id is not null) as weekly
    from bookings b
    join rooms r on r.id = b.room_id
    left join booking_series s on s.id = b.series_id
    where b.event_date >= ${from} and b.event_date <= ${to}
      and (${opts.includeCancelled ?? false} or not b.is_cancelled)
    order by b.event_date, b.start_time, r.sort_order`;
  return rows as unknown as Occurrence[];
}

// ---------- horizon top-up ----------

// Weekly series are materialised through today + HORIZON_MONTHS. This tops the
// window up lazily on read, so no scheduled job is needed. A slot that already
// exists — including one that was moved or cancelled — is left alone, because
// the uniqueness check is on (series_id, series_date), which never changes.
export async function ensureHorizon(throughDate?: string): Promise<void> {
  const today = todayInJerusalem();
  const horizon = throughDate && throughDate > addMonths(today, HORIZON_MONTHS)
    ? throughDate
    : addMonths(today, HORIZON_MONTHS);

  const series = await sql`
    select id, room_id, weekday, start_time::text as start_time, end_time::text as end_time,
           starts_on::text as starts_on, ends_on::text as ends_on
    from booking_series where is_active`;
  if (!series.length) return;

  for (const s of series as any[]) {
    const last = s.ends_on && s.ends_on < horizon ? s.ends_on : horizon;
    const begin = s.starts_on > today ? s.starts_on : today;
    try {
      await generateSlots(s, begin, last);
    } catch {
      // Topping the horizon up is a side effect of reading the calendar. One
      // awkward series must not take the whole page down with it.
    }
  }
}

// Inserts the weekly slots for a series in [from, to]. Slots that already exist
// are skipped; slots that would double-book are skipped and returned, so the
// caller can say which dates didn't make it rather than failing silently.
export async function generateSlots(
  series: { id: string; room_id: string; weekday: number; start_time: string; end_time: string },
  from: string,
  to: string,
): Promise<string[]> {
  const skipped: string[] = [];
  if (from > to) return skipped;

  // Weeks this series already owns. They're left completely alone — including
  // ones that were moved or cancelled — and don't count as clashes with itself.
  const rows = await sql`
    select series_date::text as d from bookings
    where series_id = ${series.id} and series_date >= ${from} and series_date <= ${to}`;
  const existing = new Set((rows as any[]).map((r) => r.d));

  let date = addDays(from, (series.weekday - weekdayOf(from) + 7) % 7);

  while (date <= to) {
    if (!existing.has(date)) {
      const clash = await findClash(series.room_id, date, series.start_time, series.end_time);
      if (clash) {
        skipped.push(date);
      } else {
        try {
          await sql`
            insert into bookings (series_id, series_date, room_id, event_date, start_time, end_time)
            values (${series.id}, ${date}, ${series.room_id}, ${date}, ${series.start_time}, ${series.end_time})
            on conflict (series_id, series_date) where series_id is not null do nothing`;
        } catch (e) {
          // Someone claimed the room between the check and the insert.
          if (isOverlapError(e)) skipped.push(date);
          else throw e;
        }
      }
    }
    date = addDays(date, 7);
  }
  return skipped;
}

// ---------- conflicts ----------

export type Clash = { title: string; in_charge_name: string; start_time: string; end_time: string };

// Half-open comparison: a booking ending at 20:00 does not clash with one
// starting at 20:00.
export async function findClash(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  ignoreBookingId?: string | null,
): Promise<Clash | null> {
  const rows = await sql`
    select coalesce(b.title, s.title) as title,
           coalesce(b.in_charge_name, s.in_charge_name) as in_charge_name,
           b.start_time::text as start_time, b.end_time::text as end_time
    from bookings b
    left join booking_series s on s.id = b.series_id
    where b.room_id = ${roomId}
      and b.event_date = ${date}
      and not b.is_cancelled
      and b.start_time < ${endTime} and b.end_time > ${startTime}
      and (${ignoreBookingId ?? ''} = '' or b.id <> ${ignoreBookingId ?? ''})
    limit 1`;
  return (rows[0] as unknown as Clash) ?? null;
}

export function clashMessage(clash: Clash, roomName: string): string {
  return `${roomName} תפוס בשעה הזו — ${clash.title} (${hhmm(clash.start_time)}–${hhmm(clash.end_time)}), באחריות ${clash.in_charge_name}.`;
}

// ---------- right now ----------

export type RoomStatus = {
  room: Room;
  busy: Occurrence | null;
  next: Occurrence | null;
};

// Powers the "is it free right now?" strip: the current booking if any, plus
// what's coming later today.
export function statusNow(rooms: Room[], today: Occurrence[], nowTime: string): RoomStatus[] {
  return rooms.map((room) => {
    const mine = today.filter((o) => o.room_id === room.id);
    const busy = mine.find((o) => hhmm(o.start_time) <= nowTime && hhmm(o.end_time) > nowTime) ?? null;
    const next = mine.find((o) => hhmm(o.start_time) > nowTime) ?? null;
    return { room, busy, next };
  });
}
