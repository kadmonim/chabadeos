import type { APIRoute } from 'astro';
import { sql } from '~/lib/db';
import { isSystemAdmin } from '~/lib/permissions';
import {
  findClash, clashMessage, skippedMessage, generateSlots, planSlots, isValidDate,
  isValidTime, weekdayOf, addMonths, todayInJerusalem, isOverlapError, isPurpose,
  HORIZON_MONTHS,
} from '~/lib/rooms';

// Form-post endpoint behind the /rooms screen. Everyone logged in can create;
// editing and deleting is limited to whoever created the thing, plus system
// admins — otherwise a booking made by someone who has since left would hold a
// room every week with nobody able to touch it.

// Fields worth handing back when a submission is rejected. Anything the user
// typed by hand is here; ids and _action are rebuilt from scratch instead.
const KEEP = [
  'room_id', 'title', 'purpose', 'in_charge_name', 'event_date',
  'start_time', 'end_time', 'notes', 'repeat', 'weekday', 'effective_from', 'scope',
];

// Which panel to put back on screen, so the error lands next to the form that
// caused it rather than on the calendar behind it.
function reopen(form: FormData): [string, string] | null {
  const action = String(form.get('_action') ?? '');
  const id = String(form.get('id') ?? '');
  if (action === 'create') return ['add', '1'];
  if (!id) return null;
  return action === 'update_series' || action === 'delete_series' ? ['series', id] : ['edit', id];
}

const ok = (back: string, message?: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: message ? `${back}&msg=${encodeURIComponent(message)}` : back },
  });

async function roomName(id: string): Promise<string> {
  const rows = await sql`select name from rooms where id = ${id}`;
  return (rows[0] as any)?.name ?? 'החלל';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response('unauthorized', { status: 401 });
  const admin = isSystemAdmin(user.email);

  const form = await request.formData();

  // A rejection must not cost the user what they typed: bounce back to the same
  // open panel with the submitted values echoed as f_* params, so the form comes
  // back filled in and only the offending field needs changing.
  const bad = (back: string, message: string) => {
    const p = new URLSearchParams({ err: message });
    const panel = reopen(form);
    if (panel) p.set(panel[0], panel[1]);
    for (const key of KEEP) {
      const v = form.get(key);
      if (typeof v === 'string' && v) p.set(`f_${key}`, v);
    }
    return new Response(null, { status: 303, headers: { Location: `${back}&${p}` } });
  };

  const action = String(form.get('_action') ?? '');
  const back = String(form.get('back') ?? '/rooms');
  const str = (k: string) => String(form.get(k) ?? '').trim();
  // An unknown purpose is dropped rather than rejected: it's a label, not data
  // anything depends on.
  const purposeOf = () => (isPurpose(str('purpose')) ? str('purpose') : null);

  const mayTouch = (createdBy: string | null) => admin || createdBy === user.employeeId;

  try {
    if (action === 'create') {
      const roomId = str('room_id');
      const title = str('title');
      const inCharge = str('in_charge_name');
      const date = str('event_date');
      const startTime = str('start_time');
      const endTime = str('end_time');
      const notes = str('notes') || null;
      const weekly = str('repeat') === 'weekly';

      if (!roomId || !title || !inCharge) return bad(back, 'חלל, שם ואחראי הם שדות חובה.');
      if (!isValidDate(date)) return bad(back, 'תאריך לא תקין.');
      if (!isValidTime(startTime) || !isValidTime(endTime)) return bad(back, 'שעה לא תקינה.');
      if (endTime <= startTime) return bad(back, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.');

      if (!weekly) {
        const clash = await findClash(roomId, date, startTime, endTime);
        if (clash) return bad(back, clashMessage(clash, await roomName(roomId)));
        await sql`
          insert into bookings
            (room_id, event_date, start_time, end_time, title, in_charge_name, purpose, notes, created_by)
          values (${roomId}, ${date}, ${startTime}, ${endTime}, ${title}, ${inCharge},
                  ${purposeOf()}, ${notes}, ${user.employeeId})`;
        return ok(back, 'ההזמנה נוספה.');
      }

      // Look at the whole horizon before writing anything. A weekly slot that's
      // already held by another weekly booking would otherwise produce a series
      // with almost no events in it and a wall of clash dates — so refuse, name
      // what's in the way, and let the time or the space be changed instead.
      const weekday = weekdayOf(date);
      const plan = await planSlots(
        { room_id: roomId, weekday, start_time: startTime, end_time: endTime },
        date,
        addMonths(todayInJerusalem(), HORIZON_MONTHS),
      );
      if (!plan.free.length || plan.clashes.length > plan.free.length) {
        const first = plan.clashes[0];
        return bad(
          back,
          `${clashMessage(first.clash, await roomName(roomId))} ` +
            `${plan.clashes.length} מתוך ${plan.clashes.length + plan.free.length} השבועות מתנגשים, ` +
            'לכן הסדרה לא נוצרה. אפשר לשנות שעה או לבחור חלל אחר.',
        );
      }

      const rows = await sql`
        insert into booking_series
          (room_id, title, in_charge_name, purpose, notes, weekday, start_time, end_time, starts_on, created_by)
        values (${roomId}, ${title}, ${inCharge}, ${purposeOf()}, ${notes}, ${weekday},
                ${startTime}, ${endTime}, ${date}, ${user.employeeId})
        returning id`;
      const series = {
        id: (rows[0] as any).id,
        room_id: roomId,
        weekday,
        start_time: startTime,
        end_time: endTime,
      };
      const skipped = await generateSlots(series, date, addMonths(todayInJerusalem(), HORIZON_MONTHS));
      return ok(
        back,
        skipped.length ? `הסדרה נוצרה. ${skippedMessage(skipped)}` : 'הסדרה השבועית נוצרה.',
      );
    }

    if (action === 'update_occurrence') {
      const id = str('id');
      const rows = await sql`
        select b.id, b.series_id, b.room_id, b.series_date::text as series_date,
               coalesce(b.created_by, s.created_by) as created_by
        from bookings b left join booking_series s on s.id = b.series_id
        where b.id = ${id}`;
      const row = rows[0] as any;
      if (!row) return bad(back, 'ההזמנה לא נמצאה.');
      if (!mayTouch(row.created_by)) return bad(back, 'רק מי שיצר את ההזמנה יכול לערוך אותה.');

      const date = str('event_date');
      const startTime = str('start_time');
      const endTime = str('end_time');
      const roomId = str('room_id') || row.room_id;
      if (!isValidDate(date)) return bad(back, 'תאריך לא תקין.');
      if (!isValidTime(startTime) || !isValidTime(endTime)) return bad(back, 'שעה לא תקינה.');
      if (endTime <= startTime) return bad(back, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.');

      const clash = await findClash(roomId, date, startTime, endTime, id);
      if (clash) return bad(back, clashMessage(clash, await roomName(roomId)));

      if (row.series_id) {
        // Editing one week of a weekly class almost always means "from now on" —
        // a one-week change is the exception, so the form asks and defaults to
        // the series.
        if (str('scope') !== 'one') {
          const seriesId = row.series_id;
          const from = row.series_date;
          const weekday = weekdayOf(date);
          await sql`
            update booking_series
            set room_id = ${roomId}, weekday = ${weekday},
                start_time = ${startTime}, end_time = ${endTime}
            where id = ${seriesId}`;
          // This week becomes the new rule, so it gets rebuilt too even if it was
          // hand-edited before. Other hand-edited weeks are still left alone.
          await sql`
            delete from bookings
            where series_id = ${seriesId} and series_date >= ${from}
              and (not is_modified or id = ${id})`;
          const skipped = await generateSlots(
            { id: seriesId, room_id: roomId, weekday, start_time: startTime, end_time: endTime },
            from,
            addMonths(todayInJerusalem(), HORIZON_MONTHS),
          );
          return ok(
            back,
            skipped.length
              ? `הסדרה עודכנה מהתאריך הזה והלאה. ${skippedMessage(skipped)}`
              : 'הסדרה עודכנה מהתאריך הזה והלאה.',
          );
        }

        // Flagged as modified so regenerating the series leaves this week alone.
        await sql`
          update bookings
          set room_id = ${roomId}, event_date = ${date}, start_time = ${startTime},
              end_time = ${endTime}, is_modified = true
          where id = ${id}`;
        return ok(back, 'האירוע הזה בלבד עודכן.');
      }

      const title = str('title');
      const inCharge = str('in_charge_name');
      if (!title || !inCharge) return bad(back, 'שם ואחראי הם שדות חובה.');
      await sql`
        update bookings
        set room_id = ${roomId}, event_date = ${date}, start_time = ${startTime},
            end_time = ${endTime}, title = ${title}, in_charge_name = ${inCharge},
            purpose = ${purposeOf()}, notes = ${str('notes') || null}, is_modified = true
        where id = ${id}`;
      return ok(back, 'ההזמנה עודכנה.');
    }

    if (action === 'cancel_occurrence' || action === 'restore_occurrence') {
      const id = str('id');
      const rows = await sql`
        select b.id, b.room_id, b.event_date::text as event_date,
               b.start_time::text as start_time, b.end_time::text as end_time,
               coalesce(b.created_by, s.created_by) as created_by
        from bookings b left join booking_series s on s.id = b.series_id
        where b.id = ${id}`;
      const row = rows[0] as any;
      if (!row) return bad(back, 'ההזמנה לא נמצאה.');
      if (!mayTouch(row.created_by)) return bad(back, 'רק מי שיצר את ההזמנה יכול לערוך אותה.');

      if (action === 'restore_occurrence') {
        const clash = await findClash(row.room_id, row.event_date, row.start_time, row.end_time, id);
        if (clash) return bad(back, clashMessage(clash, await roomName(row.room_id)));
        await sql`update bookings set is_cancelled = false where id = ${id}`;
        return ok(back, 'האירוע הוחזר.');
      }

      // Cancelling keeps the row as a tombstone: the slot stays claimed, so the
      // horizon top-up won't quietly regenerate it.
      await sql`update bookings set is_cancelled = true, is_modified = true where id = ${id}`;
      return ok(back, 'האירוע בוטל.');
    }

    if (action === 'delete_occurrence') {
      const id = str('id');
      const rows = await sql`select series_id, created_by from bookings where id = ${id}`;
      const row = rows[0] as any;
      if (!row) return bad(back, 'ההזמנה לא נמצאה.');
      if (row.series_id) return bad(back, 'אירוע מתוך סדרה מבוטל ולא נמחק.');
      if (!mayTouch(row.created_by)) return bad(back, 'רק מי שיצר את ההזמנה יכול למחוק אותה.');
      await sql`delete from bookings where id = ${id}`;
      return ok(back, 'ההזמנה נמחקה.');
    }

    if (action === 'update_series') {
      const id = str('id');
      const rows = await sql`select id, created_by from booking_series where id = ${id}`;
      const row = rows[0] as any;
      if (!row) return bad(back, 'הסדרה לא נמצאה.');
      if (!mayTouch(row.created_by)) return bad(back, 'רק מי שיצר את הסדרה יכול לערוך אותה.');

      const roomId = str('room_id');
      const title = str('title');
      const inCharge = str('in_charge_name');
      const notes = str('notes') || null;
      const weekday = Number(str('weekday'));
      const startTime = str('start_time');
      const endTime = str('end_time');
      const effectiveFrom = str('effective_from');

      if (!roomId || !title || !inCharge) return bad(back, 'חלל, שם ואחראי הם שדות חובה.');
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return bad(back, 'יום בשבוע לא תקין.');
      if (!isValidTime(startTime) || !isValidTime(endTime)) return bad(back, 'שעה לא תקינה.');
      if (endTime <= startTime) return bad(back, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.');
      if (!isValidDate(effectiveFrom)) return bad(back, 'תאריך תחילת התוקף לא תקין.');

      await sql`
        update booking_series
        set room_id = ${roomId}, title = ${title}, in_charge_name = ${inCharge},
            purpose = ${purposeOf()}, notes = ${notes}, weekday = ${weekday},
            start_time = ${startTime}, end_time = ${endTime}
        where id = ${id}`;

      // Rebuild the untouched future slots. Hand-edited occurrences are left
      // alone — otherwise changing the series time would wipe every exception.
      await sql`
        delete from bookings
        where series_id = ${id} and series_date >= ${effectiveFrom} and not is_modified`;
      const skipped = await generateSlots(
        { id, room_id: roomId, weekday, start_time: startTime, end_time: endTime },
        effectiveFrom,
        addMonths(todayInJerusalem(), HORIZON_MONTHS),
      );
      return ok(
        back,
        skipped.length ? `הסדרה עודכנה. ${skippedMessage(skipped)}` : 'הסדרה עודכנה.',
      );
    }

    if (action === 'delete_series') {
      const id = str('id');
      const rows = await sql`select id, created_by from booking_series where id = ${id}`;
      const row = rows[0] as any;
      if (!row) return bad(back, 'הסדרה לא נמצאה.');
      if (!mayTouch(row.created_by)) return bad(back, 'רק מי שיצר את הסדרה יכול להפסיק אותה.');

      // Stop it rather than erase it: future slots go, past ones stay as history.
      const today = todayInJerusalem();
      await sql`update booking_series set is_active = false where id = ${id}`;
      await sql`delete from bookings where series_id = ${id} and event_date >= ${today}`;
      return ok(back, 'הסדרה הופסקה. האירועים שהיו נשארו בהיסטוריה.');
    }

    return bad(back, 'פעולה לא מוכרת.');
  } catch (e) {
    if (isOverlapError(e)) return bad(back, 'החלל תפוס בשעה הזו.');
    return bad(back, `שגיאה: ${(e as Error).message}`);
  }
};
