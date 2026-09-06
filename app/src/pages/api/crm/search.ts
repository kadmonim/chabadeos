import type { APIRoute } from 'astro';
import { json } from '~/lib/api-auth';
import { requireViewer } from '~/lib/crm/access';
import { searchContacts } from '~/lib/crm/contacts';

export const GET: APIRoute = async ({ url, locals }) => {
  let viewer;
  try {
    viewer = requireViewer(locals);
  } catch {
    return json({ error: 'forbidden' }, 403);
  }
  const q = url.searchParams.get('q') ?? '';
  if (!q.trim()) return json([]);
  const results = await searchContacts(viewer, q, 8);
  return json(results);
};
