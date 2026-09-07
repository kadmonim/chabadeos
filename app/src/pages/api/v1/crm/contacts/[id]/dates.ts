import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listDates, addDate } from '~/lib/crm/dates';
import { hebrewToGreg } from '~/lib/crm/hebrew-date';
import type { DateKind, HebrewDateParts } from '~/lib/crm/types';

// ============================================================
// GET /api/v1/crm/contacts/:id/dates
// ============================================================
export const GET: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let dates;
  try {
    dates = await listDates(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ dates });
};

// ============================================================
// POST /api/v1/crm/contacts/:id/dates
// body: { kind, date? (ISO) | hebrew?: { day, month, year }, label? }
// when `date` is absent, `hebrew` is converted to a Gregorian date.
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.kind) return json({ error: 'kind required' }, 400);

  let date: string;
  if (body.date) {
    date = String(body.date);
  } else if (body.hebrew) {
    try {
      date = hebrewToGreg(body.hebrew as HebrewDateParts);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  } else {
    return json({ error: 'date or hebrew required' }, 400);
  }

  let result;
  try {
    result = await addDate(viewer, id!, {
      kind: body.kind as DateKind,
      date,
      label: body.label ?? null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  return json({ id: result.id, date }, 201);
};
