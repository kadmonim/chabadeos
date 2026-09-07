import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { gregToHebrew, hebrewToGreg, formatHebrew } from '~/lib/crm/hebrew-date';

// ============================================================
// GET /api/v1/crm/hebrew-date
// ?date=YYYY-MM-DD[&after_sunset=1]  -> convert Gregorian to Hebrew
// ?day=&month=&year=                -> convert Hebrew to Gregorian
// Pure conversion utility for integrations; still requires the API key.
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const search = url.searchParams;
  const dateParam = search.get('date');
  const dayParam = search.get('day');
  const monthParam = search.get('month');
  const yearParam = search.get('year');

  try {
    if (dateParam) {
      const afterSunset = search.get('after_sunset') === '1';
      const parts = gregToHebrew(dateParam, afterSunset);
      const formatted = formatHebrew(parts, { year: true });
      return json({ date: dateParam, hebrew: { ...parts, formatted } });
    }

    if (dayParam && monthParam && yearParam) {
      const parts = { day: Number(dayParam), month: Number(monthParam), year: Number(yearParam) };
      const date = hebrewToGreg(parts);
      const formatted = formatHebrew(parts, { year: true });
      return json({ date, hebrew: { ...parts, formatted } });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  return json({ error: 'date, or day/month/year, required' }, 400);
};
