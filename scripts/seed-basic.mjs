// Minimal seed: 1 employee (Mendy), 1 team (Chabad Renovations) with Mendy
// as admin, 1 sample issue, 1 sample todo. Idempotent on the employee +
// membership; reruns will create extra teams/issues/todos.

import 'dotenv/config';
import pg from 'pg';

const url = process.env.NETLIFY_DB_URL;
if (!url) throw new Error('NETLIFY_DB_URL not set');

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows: [emp] } = await client.query(
  `insert into employees (full_name, email) values ($1, $2)
   on conflict (email) do update set full_name = excluded.full_name
   returning id`,
  ['מענדי', 'mendye@gmail.com'],
);
console.log('employee:', emp.id);

const { rows: [team] } = await client.query(
  `insert into teams (name, description) values ($1, $2) returning id`,
  ['Chabad Renovations', 'Renovations team'],
);
console.log('team:', team.id);

await client.query(
  `insert into team_memberships (team_id, employee_id, role)
   values ($1, $2, 'admin')
   on conflict (team_id, employee_id) do nothing`,
  [team.id, emp.id],
);
console.log('membership: linked');

const { rows: [iss] } = await client.query(
  `insert into issues (title, description, team_id, owner_employee_id, type, term_type, status)
   values ($1, $2, $3, $4, 'problem', 'short_term', 'open') returning id`,
  ['Sample issue: scope renovation kickoff meeting', 'Replace with a real issue.', team.id, emp.id],
);
console.log('issue:', iss.id);

const { rows: [td] } = await client.query(
  `insert into todos (title, description, team_id, assignee_employee_id, status)
   values ($1, $2, $3, $4, 'open') returning id`,
  ['Sample task: walk the site', 'Replace with a real todo.', team.id, emp.id],
);
console.log('todo:', td.id);

await client.end();
console.log('done');
