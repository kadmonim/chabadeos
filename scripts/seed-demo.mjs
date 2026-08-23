// Demo content for the chabadeos fork: V/TO (singleton) + a few rocks for
// the "Chabad Renovations" team owned by Mendy. Re-runnable: V/TO upserts;
// rocks are inserted only if a rock with the same title doesn't already exist.

import 'dotenv/config';
import pg from 'pg';

const url = process.env.NETLIFY_DB_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();

// -------------------- V/TO --------------------
const vision = {
  core_values: [
    { name: 'Quality craftsmanship', description: 'Build it once, build it right.' },
    { name: 'On time, on budget', description: 'Predictable delivery is the product.' },
    { name: 'Respect for the community', description: 'Sites stay clean, neighbors stay informed, kavod habriyos always.' },
    { name: 'Safety first', description: 'Nobody goes home hurt.' },
  ],
  core_focus: {
    purpose: 'Build and renovate spaces that strengthen Jewish community life.',
    niche: 'Construction and renovation for Chabad centers, schools, and shuls.',
  },
  ten_year_target: [
    '100 completed projects',
    '$50M in completed work',
    'Active in 10 regions',
  ],
  marketing: {
    target_market: 'Chabad shluchim and mosdos planning a renovation or new build (≥$100K scope).',
    uniques: [
      { name: 'Frum-friendly site', description: 'Tznius, Shabbos-aware scheduling, kosher break room.' },
      { name: 'Mosdos-specific PM', description: 'Knows shul/school code requirements out of the box.' },
      { name: 'Fixed-price option', description: 'No open-ended T&M surprises.' },
    ],
    proven_process: 'Walkthrough → Scope → Quote → Build → Punch list → Handover.',
    system_promise: 'A finished space, on the date we promised, for the price we quoted.',
  },
  three_year: {
    future_date: '2029-04-26',
    revenue: { budget: 5000000, profit: 750000 },
    measurables: [
      { name: 'Projects completed / year', value: '15' },
      { name: 'On-time delivery rate', value: '90%' },
      { name: 'Repeat / referral revenue', value: '60%' },
    ],
    looks_like: [
      'Standardized PM playbook used on every project',
      '25-person team (PMs, foremen, trades)',
      'Office and warehouse in primary region',
      'Website with full portfolio + testimonials',
    ],
  },
};

const traction = {
  one_year: {
    future_date: '2027-04-26',
    revenue: { budget: 1500000, profit: 200000 },
    measurables: [
      { name: 'Projects completed', value: '8' },
      { name: 'On-time delivery rate', value: '80%' },
      { name: 'Customer satisfaction', value: '4.5/5' },
    ],
    goals: [
      'Hire a full-time field project manager',
      'Standardize the intake → quote workflow',
      'Launch the chabadeos.com website with project portfolio',
      'Land 2 anchor projects ≥ $250K',
      'Set up basic accounting + job costing in QuickBooks',
    ],
  },
  ninety_day: {
    future_date: '2026-07-26',
    revenue: { budget: 375000, profit: 40000 },
    measurables: [
      { name: 'Projects in progress', value: '3' },
      { name: 'Projects closed', value: '1' },
      { name: 'New leads', value: '12' },
    ],
  },
};

const swot = {
  strengths: ['Strong community network', 'Experienced foreman'],
  weaknesses: ['No formal PM system', 'Single-region only'],
  opportunities: ['Growing Chabad expansion in tier-2 cities'],
  threats: ['Material price volatility', 'Skilled labor shortage'],
};

const existing = await client.query('select id from vtos limit 1');
if (existing.rows[0]) {
  await client.query(
    `update vtos set vision = $1, traction = $2, swot = $3 where id = $4`,
    [JSON.stringify(vision), JSON.stringify(traction), JSON.stringify(swot), existing.rows[0].id],
  );
  console.log(`updated V/TO (${existing.rows[0].id})`);
} else {
  await client.query(
    `insert into vtos (vision, traction, swot) values ($1, $2, $3)`,
    [JSON.stringify(vision), JSON.stringify(traction), JSON.stringify(swot)],
  );
  console.log('inserted V/TO');
}

// -------------------- Rocks --------------------
const { rows: [emp] } = await client.query(
  `select id from employees where email = $1 limit 1`,
  ['mendye@gmail.com'],
);
if (!emp) throw new Error('Mendy employee row not found — run seed-basic.mjs first');

const rocks = [
  {
    title: 'Standardize project intake → quote workflow',
    description: 'Define a repeatable form, walkthrough checklist, and quote template so every new project starts the same way.',
    due_date: '2026-07-26',
    priority_order: 1,
  },
  {
    title: 'Hire field project manager',
    description: 'Source, interview, and hire one full-time PM to own day-to-day site oversight.',
    due_date: '2026-07-15',
    priority_order: 2,
  },
  {
    title: 'Launch chabadeos.com website with portfolio',
    description: 'Pick a stack, get 5 past projects photographed and written up, ship a public site.',
    due_date: '2026-06-30',
    priority_order: 3,
  },
];

for (const r of rocks) {
  const { rowCount } = await client.query(
    `insert into rocks (title, description, owner_employee_id, due_date, status, priority_order)
     select $1, $2, $3, $4::date, 'on_track', $5
     where not exists (select 1 from rocks where title = $1)`,
    [r.title, r.description, emp.id, r.due_date, r.priority_order],
  );
  console.log(rowCount ? `inserted rock: ${r.title}` : `skipped (exists): ${r.title}`);
}

await client.end();
console.log('done');
