import type { APIRoute } from 'astro';
import { supabase } from '~/lib/supabase';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;

  const { data, error } = await supabase
    .from('vtos')
    .select('id, vision, traction, swot, updated_at')
    .limit(1)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ vto: null });

  return json({
    vto: {
      id: data.id,
      updated_at: data.updated_at,
      vision: data.vision ?? {},
      traction: data.traction ?? {},
      swot: data.swot ?? {},
    },
  });
};
