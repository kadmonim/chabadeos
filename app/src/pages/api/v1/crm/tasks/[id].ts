import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';
import { resolveEmployeeByEmail } from '~/lib/api-lookup';
import { apiViewer } from '~/lib/crm/api-viewer';
import { updateTask, deleteTask } from '~/lib/crm/tasks';

// ============================================================
// PATCH /api/v1/crm/tasks/:id
// body: { title?, due_date?, assignee_email?, done? }
// ============================================================
export const PATCH: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'body must be JSON' }, 400); }

  let assigneeEmployeeId: string | null | undefined;
  if (body.assignee_email !== undefined) {
    if (!body.assignee_email) {
      assigneeEmployeeId = null;
    } else {
      assigneeEmployeeId = await resolveEmployeeByEmail(String(body.assignee_email));
      if (!assigneeEmployeeId) return json({ error: `no employee with email '${body.assignee_email}'` }, 400);
    }
  }

  let ok: boolean;
  try {
    ok = await updateTask(viewer, id!, {
      title: body.title,
      due_date: body.due_date,
      assignee_employee_id: assigneeEmployeeId,
      done: body.done,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};

// ============================================================
// DELETE /api/v1/crm/tasks/:id
// ============================================================
export const DELETE: APIRoute = async ({ request, params }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  const viewer = await apiViewer(request);
  if (viewer instanceof Response) return viewer;

  const { id } = params;

  let ok: boolean;
  try {
    ok = await deleteTask(viewer, id!);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!ok) return json({ error: 'not found' }, 404);

  return new Response(null, { status: 204 });
};
