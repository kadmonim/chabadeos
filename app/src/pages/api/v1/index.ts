import type { APIRoute } from 'astro';
import { requireApiKey, json } from '~/lib/api-auth';

export const GET: APIRoute = async ({ request }) => {
  const unauth = requireApiKey(request);
  if (unauth) return unauth;
  return json({
    name: 'GYE EOS Read API',
    version: 1,
    docs: 'https://github.com/webshadoworg/eos',
    auth: 'Authorization: Bearer <API_KEY>',
    endpoints: {
      'GET /api/v1/employees':            'List employees. Optional ?email= filter.',
      'GET /api/v1/contacts':             'List contacts. Optional ?q= name search, ?category=, ?employee_id=.',
      'GET /api/v1/teams':                'List teams with members.',
      'GET /api/v1/rocks':                'List non-archived rocks with milestones.',
      'GET /api/v1/issues':               'List issues. Optional ?assignee=<email>, ?team_id=, ?status=, ?term=short_term|long_term.',
      'POST /api/v1/issues':              'Create an issue. Body: { title, description?, owner_email?, team_id? | team_name?, term_type? (default short_term), type?, priority? (1-5) }. Returns { id }.',
      'PATCH /api/v1/issues':             'Mark an issue solved/open. Body: { id, solved? (default true) }.',
      'GET /api/v1/todos':                'List todos. Optional ?assignee=<email>, ?team_id=, ?status=open|done|archived|all (default open).',
      'POST /api/v1/todos':               'Create a todo. Body: { title, description?, assignee_email?, team_id? | team_name?, due_date?, is_urgent? }. Returns { id }.',
      'PATCH /api/v1/todos':              'Mark a todo done/open. Body: { id, done? (default true) }.',
      'GET /api/v1/vto':                  'Get the singleton V/TO (vision + traction + swot).',
    },
  });
};
