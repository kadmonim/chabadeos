// Add an employee. Usage:
//   node scripts/add-employee.mjs "Full Name" email@example.com
//
// Email must match the Google account the person will log in with.
// Idempotent — re-running with the same email just updates the name.

import 'dotenv/config';
import pg from 'pg';

const [, , fullName, email] = process.argv;
if (!fullName || !email) {
  console.error('Usage: node scripts/add-employee.mjs "Full Name" email@example.com');
  process.exit(1);
}

const url = process.env.NETLIFY_DB_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows: [emp] } = await client.query(
  `insert into employees (full_name, email) values ($1, $2)
   on conflict (email) do update set full_name = excluded.full_name
   returning id, full_name, email`,
  [fullName, email],
);

await client.end();
console.log(`employee: ${emp.full_name} <${emp.email}> (${emp.id})`);
console.log('next: open /teams in the app and use "Add a member" to attach them to a team.');
