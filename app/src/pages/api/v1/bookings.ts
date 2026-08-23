import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { requireApiKey, json } from '~/lib/api-auth';
import {
  listRooms, occurrencesBetween, ensureHorizon, generateSlots, findClash, clashMessage,
  isValidDate, isValidTime, weekdayOf, weekStart, addDays, addMonths, todayInJerusalem,
  hhmm, isOverlapError, HORIZON_MONTHS,
} from '~/lib/rooms';

// Room bookings for machines. Occurrences are returned as real dated slots, not
// recurrence rules, so an integration never has to expand a weekly series itself.

async function resolveRoom(ref: string | null | undefined): Promise<{ id: string; name: string } | null> {
  if (!ref) return null;
  const rooms = await listRooms();
  const needle = String(ref).trim().toLowerCase();
  return rooms.find((r) => r.id === ref || r.name.toLowerCase() === needle) ?? null;
}

const shape = (o: any) => ({
  id: o.id,
  room: { id: o.room_id, name: o.room_name },
  date: o.event_date,
  start_time: hhmm(o.start_time),
  end_time: hhmm(o.end_time),
  title: o.title,
  in_charge_name: o.in_charge_name,
  notes: o.notes,
  weekly: o.weekly,
  series_id: o.series_id,
  is_cancelled: o.is_cancelled,
});

// ============================================================
// GET /api/v1/bookings?from=&to=&room=&include_cancelled=1
// Defaults to the current week.
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const today = todayInJerusalem();
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = isValidDate(fromParam) ? fromParam : weekStart(today);
  const to = isValidDate(toParam) ? toParam : addDays(from, 6);
  if (to < from) return json({ error: 'to must not be before from' }, 400);

  const roomRef = url.searchParams.get('room') ?? url.searchParams.get('room_id');
  let roomId: string | null = null;
  if (roomRef) {
    const room = await resolveRoom(roomRef);
    if (!room) return json({ bookings: [], count: 0, note: `no room matching '${roomRef}'` });
    roomId = room.id;
  }

  try {
    await ensureHorizon(to);
    const all = await occurrencesBetween(from, to, {
      includeCancelled: url.searchParams.get('include_cancelled') === '1',
    });
    const bookings = all.filter((o) => !roomId || o.room_id === roomId).map(shape);
    return json({ from, to, bookings, count: bookings.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};

// ============================================================
// POST /api/v1/bookings — book a room
// body: { room (id or name), title, in_charge_name, date (YYYY-MM-DD),
//         start_time (HH:MM), end_time, notes?, weekly? (bool), ends_on? }
// Double booking is rejected, never merged.
// ============================================================
export const POST: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const room = await resolveRoom(body?.room ?? body?.room_id ?? body?.room_name);
  if (!room) return json({ error: 'room is required (id or name); see GET /api/v1/rooms' }, 400);

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const inCharge = typeof body?.in_charge_name === 'string' ? body.in_charge_name.trim() : '';
  if (!title) return json({ error: 'title is required' }, 400);
  if (!inCharge) return json({ error: 'in_charge_name is required' }, 400);

  const date = body?.date ? String(body.date) : '';
  const startTime = body?.start_time ? String(body.start_time) : '';
  const endTime = body?.end_time ? String(body.end_time) : '';
  if (!isValidDate(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
  if (!isValidTime(startTime) || !isValidTime(endTime)) return json({ error: 'times must be HH:MM' }, 400);
  if (endTime <= startTime) return json({ error: 'end_time must be after start_time' }, 400);

  const notes = body?.notes ? String(body.notes) : null;
  const endsOn = body?.ends_on ? String(body.ends_on) : null;
  if (endsOn && !isValidDate(endsOn)) return json({ error: 'ends_on must be YYYY-MM-DD' }, 400);

  try {
    if (body?.weekly !== true) {
      const clash = await findClash(room.id, date, startTime, endTime);
      if (clash) return json({ error: clashMessage(clash, room.name), conflict: clash }, 409);
      const rows = await sql`
        insert into bookings (room_id, event_date, start_time, end_time, title, in_charge_name, notes)
        values (${room.id}, ${date}, ${startTime}, ${endTime}, ${title}, ${inCharge}, ${notes})
        returning id`;
      return json({ id: (rows[0] as any).id, weekly: false }, 201);
    }

    // The first week has to fit, or the series has nothing to start from.
    const firstClash = await findClash(room.id, date, startTime, endTime);
    if (firstClash) return json({ error: clashMessage(firstClash, room.name), conflict: firstClash }, 409);

    const weekday = weekdayOf(date);
    const rows = await sql`
      insert into booking_series
        (room_id, title, in_charge_name, notes, weekday, start_time, end_time, starts_on, ends_on)
      values (${room.id}, ${title}, ${inCharge}, ${notes}, ${weekday},
              ${startTime}, ${endTime}, ${date}, ${endsOn})
      returning id`;
    const seriesId = (rows[0] as any).id;
    const horizon = addMonths(todayInJerusalem(), HORIZON_MONTHS);
    const skipped = await generateSlots(
      { id: seriesId, room_id: room.id, weekday, start_time: startTime, end_time: endTime },
      date,
      endsOn && endsOn < horizon ? endsOn : horizon,
    );
    return json({ series_id: seriesId, weekly: true, weekday, skipped_dates: skipped }, 201);
  } catch (e) {
    if (isOverlapError(e)) return json({ error: `${room.name} is already booked then` }, 409);
    return json({ error: (e as Error).message }, 500);
  }
};

// ============================================================
// PATCH /api/v1/bookings — edit one occurrence or a whole series
// occurrence: { id, date?, start_time?, end_time?, title?, in_charge_name?,
//               notes?, room?, is_cancelled? }
// series:     { series_id, title?, in_charge_name?, notes?, weekday?, start_time?,
//               end_time?, room?, effective_from? (default today), is_active? }
// Editing a single occurrence marks it as an exception, so later series edits
// leave it alone.
// ============================================================
export const PATCH: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const seriesId = body?.series_id ? String(body.series_id) : '';
  const id = body?.id ? String(body.id) : '';
  if (!id && !seriesId) return json({ error: 'id (occurrence) or series_id is required' }, 400);

  try {
    if (seriesId) return await patchSeries(seriesId, body);
    return await patchOccurrence(id, body);
  } catch (e) {
    if (isOverlapError(e)) return json({ error: 'that room is already booked then' }, 409);
    return json({ error: (e as Error).message }, 500);
  }
};

async function patchOccurrence(id: string, body: any): Promise<Response> {
  const rows = await sql`
    select b.id, b.series_id, b.room_id, b.event_date::text as event_date,
           b.start_time::text as start_time, b.end_time::text as end_time,
           b.title, b.in_charge_name, b.notes, b.is_cancelled
    from bookings b where b.id = ${id}`;
  const row = rows[0] as any;
  if (!row) return json({ error: `no booking with id '${id}'` }, 404);

  let roomId = row.room_id;
  let roomName = '';
  if (body.room !== undefined || body.room_id !== undefined) {
    const room = await resolveRoom(body.room ?? body.room_id);
    if (!room) return json({ error: 'room not found' }, 400);
    roomId = room.id;
    roomName = room.name;
  }

  const date = body.date !== undefined ? String(body.date) : row.event_date;
  const startTime = body.start_time !== undefined ? String(body.start_time) : row.start_time;
  const endTime = body.end_time !== undefined ? String(body.end_time) : row.end_time;
  if (!isValidDate(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
  if (!isValidTime(startTime) || !isValidTime(endTime)) return json({ error: 'times must be HH:MM' }, 400);
  if (endTime <= startTime) return json({ error: 'end_time must be after start_time' }, 400);

  const cancelled = body.is_cancelled !== undefined ? Boolean(body.is_cancelled) : row.is_cancelled;
  if (!cancelled) {
    const clash = await findClash(roomId, date, startTime, endTime, id);
    if (clash) {
      if (!roomName) roomName = ((await sql`select name from rooms where id = ${roomId}`)[0] as any)?.name ?? 'the room';
      return json({ error: clashMessage(clash, roomName), conflict: clash }, 409);
    }
  }

  // A one-off carries its own title; a series occurrence leaves these null and
  // inherits from the series unless they are overridden here.
  const title = body.title !== undefined ? String(body.title).trim() : row.title;
  const inCharge = body.in_charge_name !== undefined ? String(body.in_charge_name).trim() : row.in_charge_name;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : row.notes;
  if (!row.series_id && (!title || !inCharge)) {
    return json({ error: 'title and in_charge_name cannot be empty' }, 400);
  }

  await sql`
    update bookings set
      room_id = ${roomId}, event_date = ${date}, start_time = ${startTime}, end_time = ${endTime},
      title = ${title || null}, in_charge_name = ${inCharge || null}, notes = ${notes},
      is_cancelled = ${cancelled}, is_modified = true
    where id = ${id}`;

  return json({
    id, date, start_time: startTime, end_time: endTime, room_id: roomId, is_cancelled: cancelled,
  });
}

async function patchSeries(seriesId: string, body: any): Promise<Response> {
  const rows = await sql`
    select id, room_id, title, in_charge_name, notes, weekday,
           start_time::text as start_time, end_time::text as end_time, is_active
    from booking_series where id = ${seriesId}`;
  const s = rows[0] as any;
  if (!s) return json({ error: `no series with id '${seriesId}'` }, 404);

  let roomId = s.room_id;
  if (body.room !== undefined || body.room_id !== undefined) {
    const room = await resolveRoom(body.room ?? body.room_id);
    if (!room) return json({ error: 'room not found' }, 400);
    roomId = room.id;
  }

  const title = body.title !== undefined ? String(body.title).trim() : s.title;
  const inCharge = body.in_charge_name !== undefined ? String(body.in_charge_name).trim() : s.in_charge_name;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : s.notes;
  const weekday = body.weekday !== undefined ? Number(body.weekday) : s.weekday;
  const startTime = body.start_time !== undefined ? String(body.start_time) : s.start_time;
  const endTime = body.end_time !== undefined ? String(body.end_time) : s.end_time;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : s.is_active;

  if (!title) return json({ error: 'title cannot be empty' }, 400);
  if (!inCharge) return json({ error: 'in_charge_name cannot be empty' }, 400);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return json({ error: 'weekday must be 0 (Sunday) through 6 (Saturday)' }, 400);
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) return json({ error: 'times must be HH:MM' }, 400);
  if (endTime <= startTime) return json({ error: 'end_time must be after start_time' }, 400);

  const today = todayInJerusalem();
  const effectiveFrom = body.effective_from !== undefined ? String(body.effective_from) : today;
  if (!isValidDate(effectiveFrom)) return json({ error: 'effective_from must be YYYY-MM-DD' }, 400);

  await sql`
    update booking_series set
      room_id = ${roomId}, title = ${title}, in_charge_name = ${inCharge}, notes = ${notes},
      weekday = ${weekday}, start_time = ${startTime}, end_time = ${endTime}, is_active = ${isActive}
    where id = ${seriesId}`;

  if (!isActive) {
    await sql`delete from bookings where series_id = ${seriesId} and event_date >= ${today}`;
    return json({ series_id: seriesId, is_active: false, note: 'future occurrences removed, history kept' });
  }

  // Only untouched slots are rebuilt: hand-edited occurrences stay as they are.
  await sql`
    delete from bookings
    where series_id = ${seriesId} and series_date >= ${effectiveFrom} and not is_modified`;
  const skipped = await generateSlots(
    { id: seriesId, room_id: roomId, weekday, start_time: startTime, end_time: endTime },
    effectiveFrom,
    addMonths(today, HORIZON_MONTHS),
  );

  return json({
    series_id: seriesId, title, in_charge_name: inCharge, weekday,
    start_time: startTime, end_time: endTime, effective_from: effectiveFrom, skipped_dates: skipped,
  });
}

// ============================================================
// DELETE /api/v1/bookings
// body: { id } — cancels a series occurrence, deletes a one-off
//        { series_id } — stops the series; past occurrences stay as history
// ============================================================
export const DELETE: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  const seriesId = body?.series_id ? String(body.series_id) : '';
  const id = body?.id ? String(body.id) : '';
  if (!id && !seriesId) return json({ error: 'id (occurrence) or series_id is required' }, 400);

  try {
    if (seriesId) {
      const exists = await sql`select id from booking_series where id = ${seriesId}`;
      if (!exists[0]) return json({ error: `no series with id '${seriesId}'` }, 404);
      const today = todayInJerusalem();
      await sql`update booking_series set is_active = false where id = ${seriesId}`;
      await sql`delete from bookings where series_id = ${seriesId} and event_date >= ${today}`;
      return json({ series_id: seriesId, stopped: true, note: 'past occurrences kept as history' });
    }

    const rows = await sql`select id, series_id from bookings where id = ${id}`;
    const row = rows[0] as any;
    if (!row) return json({ error: `no booking with id '${id}'` }, 404);

    if (row.series_id) {
      // Kept as a tombstone so the horizon top-up won't regenerate the slot.
      await sql`update bookings set is_cancelled = true, is_modified = true where id = ${id}`;
      return json({ id, cancelled: true });
    }
    await sql`delete from bookings where id = ${id}`;
    return json({ id, deleted: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};
