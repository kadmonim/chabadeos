import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listMyTasks } from '~/lib/crm/tasks';

// ============================================================
// GET /api/v1/crm/tasks
// query: ?assignee=<email>|all, ?include_done=1, ?limit=
// default assignee: the viewer; for the service account (no
// X-On-Behalf-Of) with no ?assignee given, defaults to 'all'.
// ============================================================
export const GET: APIRoute = async ({ request, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const search = url.searchParams;
  const includeDone = search.get('include_done') === '1';
  const limitParam = search.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  let assignee: string | 'all' | undefined;
  const assigneeParam = search.get('assignee');
  if (assigneeParam === 'all') {
    assignee = 'all';
  } else if (assigneeParam) {
    const employeeId = await resolveEmployeeByEmail(assigneeParam);
    if (!employeeId) return json({ error: `no employee with email '${assigneeParam}'` }, 400);
    assignee = employeeId;
  } else if (viewer.employeeId === '') {
    // SERVICE_VIEWER with no assignee filter: default to every visible task.
    assignee = 'all';
  }

  let tasks;
  try {
    tasks = await listMyTasks(viewer, { assignee, includeDone, limit });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ tasks });
};
