import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { listTasksForContact, createTask } from '~/lib/crm/tasks';

// ============================================================
// GET /api/v1/crm/contacts/:id/tasks
// query: ?include_done=1
// ============================================================
export const GET: APIRoute = async ({ request, params, url }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;
  const includeDone = url.searchParams.get('include_done') === '1';

  let tasks;
  try {
    tasks = await listTasksForContact(viewer, id!, { includeDone });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ tasks });
};

// ============================================================
// POST /api/v1/crm/contacts/:id/tasks
// body: { title, due_date?, assignee_email? }
// ============================================================
export const POST: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }
  if (!body.title) return json({ error: 'title required' }, 400);

  let assigneeEmployeeId: string | null | undefined;
  if (body.assignee_email !== undefined && body.assignee_email !== null) {
    assigneeEmployeeId = await resolveEmployeeByEmail(String(body.assignee_email));
    if (!assigneeEmployeeId) return json({ error: `no employee with email '${body.assignee_email}'` }, 400);
  }

  let result;
  try {
    result = await createTask(viewer, id!, {
      title: String(body.title),
      due_date: body.due_date ?? null,
      assignee_employee_id: assigneeEmployeeId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  return json({ id: result.id }, 201);
};
