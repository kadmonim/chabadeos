import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { listRooms } from '~/lib/rooms';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const rooms = await listRooms();
  return json({ rooms, count: rooms.length });
};
