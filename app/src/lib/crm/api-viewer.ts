// Viewer resolution for the /api/v1/crm/* machine API.
// API keys act as a trusted admin service account; an optional
// X-On-Behalf-Of header narrows visibility to (and attributes writes to)
// a specific CRM user.
import { json } from '../api-auth';
import { viewerFromEmail, SERVICE_VIEWER } from './access';
import type { Viewer } from './types';

export async function apiViewer(request: Request): Promise<Viewer | Response> {
  const onBehalfOf = request.headers.get('x-on-behalf-of');
  if (onBehalfOf) {
    const viewer = await viewerFromEmail(onBehalfOf);
    if (!viewer) return json({ error: 'unknown CRM user' }, 400);
    return viewer;
  }
  return SERVICE_VIEWER;
}
