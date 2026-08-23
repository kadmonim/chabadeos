import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  return json({
    name: 'Chabad Central API',
    version: 1,
    docs: 'https://github.com/webshadoworg/eos',
    auth: 'Authorization: Bearer <API_KEY>',
    endpoints: {
      'GET /api/v1/employees':            'List employees. Optional ?email= filter.',
      'POST /api/v1/employees':           'Create an employee. Body: { full_name, email, team_id? | team_name?, role? (admin|member) }. Returns { id }.',
      'PATCH /api/v1/employees':          'Update an employee. Body: { id? | email?, full_name?, new_email? }.',
      'GET /api/v1/teams':                'List teams with members.',
      'POST /api/v1/teams':               'Create a team. Body: { name, description?, members? [{ email, role?, role_description? }] }. Returns { id }.',
      'PATCH /api/v1/teams':              'Rename a team / change its description. Body: { id? | team_name?, name?, description? }.',
      'DELETE /api/v1/teams':             'Delete a team. Body: { id? | team_name?, confirm_name (must match the exact team name) }.',
      'GET /api/v1/teams/:id/members':    'List a team\'s members. :id accepts a team id or name.',
      'POST /api/v1/teams/:id/members':   'Add someone to the team (idempotent — re-posting updates their role). Body: { email? | employee_id?, role?, role_description? }.',
      'DELETE /api/v1/teams/:id/members': 'Remove someone from the team. Body: { email? | employee_id? }.',
      'GET /api/v1/rocks':                'List non-archived rocks (projects). Optional ?include_archived=1.',
      'POST /api/v1/rocks':               'Create a rock. Body: { title, description?, owner_email?, due_date?, status? (on_track|off_track|done, default on_track), priority_order? }. Returns { id }.',
      'PATCH /api/v1/rocks':              'Update a rock. Body: { id, title?, description?, owner_email?, due_date?, status?, priority_order?, is_archived? }.',
      'GET /api/v1/issues':               'List issues. Optional ?assignee=<email>, ?team= (id or name), ?status=, ?term=short_term|long_term|idea_backlog.',
      'POST /api/v1/issues':              'Create an issue. Body: { title, description?, owner_email?, team_id? | team_name?, term_type? (short_term|long_term|idea_backlog, default short_term), type?, priority? (1-5) }. Returns { id }.',
      'PATCH /api/v1/issues':             'Update an issue. Body: { id, solved?, status?, title?, description?, team_id? | team_name? (moves it), owner_email?, term_type?, type?, priority? }. Bare { id } marks it solved.',
      'GET /api/v1/issues/:id/shares':    'List teams the issue is shared with.',
      'POST /api/v1/issues/:id/shares':   'Share the issue with a team. Body: { team_id } or { team_name }.',
      'DELETE /api/v1/issues/:id/shares': 'Unshare. Body: { team_id } or { team_name }.',
      'GET /api/v1/todos':                'List todos. Optional ?assignee=<email>, ?team= (id or name), ?status=open|done|archived|all (default open).',
      'POST /api/v1/todos':               'Create a todo. Body: { title, description?, assignee_email?, team_id? | team_name?, due_date?, is_urgent? }. Returns { id }.',
      'PATCH /api/v1/todos':              'Update a todo. Body: { id, done?, status?, title?, description?, is_urgent?, due_date?, assignee_email?, team_id? | team_name? (moves it) }.',
      'GET /api/v1/feature-ideas':         'List feature ideas. Optional ?owner=<email>, ?status=, ?term=, ?tag=.',
      'POST /api/v1/feature-ideas':        'Create a feature idea. Body: { title, description?, owner_email?, term_type?, priority? (1-5), tags? (string[]) }. Returns { id }.',
      'PATCH /api/v1/feature-ideas':       'Update a feature idea. Body: { id, solved?, status?, tags? }.',
      'GET /api/v1/rooms':                'List bookable rooms.',
      'GET /api/v1/bookings':             'List room bookings as dated occurrences. ?from=&to= (default this week), ?room= (id or name), ?include_cancelled=1.',
      'POST /api/v1/bookings':            'Book a room. Body: { room (id or name), title, in_charge_name, date, start_time, end_time, notes?, weekly? (bool), ends_on? }. Double bookings are rejected with 409.',
      'PATCH /api/v1/bookings':           'Edit one occurrence: { id, date?, start_time?, end_time?, title?, in_charge_name?, notes?, room?, is_cancelled? }. Or a whole weekly series: { series_id, title?, in_charge_name?, notes?, weekday? (0=Sun), start_time?, end_time?, room?, effective_from? (default today), is_active? }.',
      'DELETE /api/v1/bookings':          'Body: { id } cancels a series occurrence / deletes a one-off. { series_id } stops the series and keeps past occurrences.',
      'GET /api/v1/org-seats':            'Get the org chart as a nested tree. ?flat=1 for a flat list.',
      'POST /api/v1/org-seats':           'Create a seat. Body: { title, parent_id? | parent_title?, employee_email?, person_name?, responsibilities?, display_order? }. Returns { id }.',
      'PATCH /api/v1/org-seats':          'Update or move a seat. Body: { id? | title?, new_title?, parent_id? | parent_title?, employee_email?, person_name?, responsibilities?, display_order? }.',
      'DELETE /api/v1/org-seats':         'Delete a seat. Body: { id? | title?, cascade? }. Seats with reports need cascade: true.',
      'GET /api/v1/vto':                  'Get the singleton V/TO (vision + traction + swot).',
    },
  });
};
