// Seed the organization's V/TO (singleton row) with vision + traction data.

import 'dotenv/config';
import pg from 'pg';

const url = process.env.SUPABASE_DB_SESSION_POOLER_URL || process.env.SUPABASE_DB_URL;
const client = new pg.Client({ connectionString: url });
await client.connect();

const vision = {
  core_values: [
    {
      name: 'Believes in the cause',
      description: 'Idealistic (לשם שמים) with deep care for the cause and driven by empathy for the strugglers',
    },
    {
      name: 'Do what you say',
      description: 'Demonstrating integrity, following through on commitments, knowing thousands depend on our actions.',
    },
    {
      name: 'Takes initiative',
      description: 'Proactively identifying opportunities and taking action without being prompted, showing leadership and resourcefulness.',
    },
    {
      name: 'Sense of Urgency',
      description: 'Understanding that every moment counts when lives are on the line.',
    },
  ],
  core_focus: {
    purpose: "Restoring Kedusha and a sense of self-worth to all Jews by helping people untangle from today's online temptations",
    niche: 'Jews seeking freedom from pornography',
  },
  ten_year_target: [
    '100,000 signups (2026 - 2035)',
    '20,000 donors (in 2033)',
    '$5M budget (in 2033)',
    '25,000 first-time phone calls (2026 - 2035)',
    '75,000 reach 30 days clean (2026 - 2035)',
  ],
  marketing: {
    target_market: 'Jews, struggling with porn, in emotional pain about their struggle (males, 18+)',
    uniques: [
      { name: 'One of a kind', description: '#1 resource' },
      { name: 'There are no barriers to entry', description: "it's accessible globally, online, free, anonymous" },
      { name: 'We can help all levels of the struggle', description: 'multiple approaches and resources' },
    ],
    proven_process: 'Motivation. Planning. Connection. (Visual TBD)',
    system_promise:
      'Break free from the shackles of addictive behaviors and regain kedusha and a sense of self-worth in your life.',
  },
  three_year: {
    future_date: '2028-12-31',
    revenue: { budget: 2500000, profit: null },
    measurables: [
      { name: 'Signups', value: '10,000' },
      { name: 'Donors', value: '7,000' },
      { name: 'First-time phone calls', value: '2,500' },
      { name: '30 Days Reached', value: '7,500' },
      { name: 'Very significant help', value: null },
    ],
    looks_like: [
      '75% success rate in assessment results',
      '90% of people signed-up are satisfied by their experience',
      'Tech & user support: FT staff for each language + volunteer mentors',
      '100% right people, right seats',
      'Every major function leader has an assistant',
      'Full-time fundraising leader',
      '1 FT (US East Coast), 4 PT fundraisers (in various regions/communities)',
      'Our target market knows what Guard Your Eyes does',
      'Every aspect of Chabad Central (materials, emails, etc.) is high quality & professional.',
      'Members feel compelled to give back (by helping others or donating)',
      'Users can interact with a trained volunteer anytime to receive support (in real-time)',
      'Every member gets a personal welcome & an offer to talk',
      'Members are offered a trained volunteer mentor',
      'Users can benefit from Chabad Central offline or Kosher phone (via printed materials/hotline)',
    ],
  },
};

const traction = {
  one_year: {
    future_date: '2026-12-31',
    revenue: { budget: '2.5 mil', profit: null },
    measurables: [
      { name: 'Signups', value: '5,000' },
      { name: 'Donors', value: '6,500' },
      { name: 'First-time phone calls', value: '1,500' },
      { name: '30 Days Reached', value: '3,000' },
      { name: 'Very significant help', value: '1,300' },
    ],
    goals: [
      'First Call/Chat Setup (w/ top quality person) - every member gets a personal welcome & multiple offers to talk (max wait time 7 days)',
      'Implement Case Management (i.e. we know what happened to each member that signed up this year)',
      'Periodic check-ins (at least during the first 30 days)',
      "Users know they can ask us a question any time, and they'll get a written answer from a high-quality support person within 24 hours. (Mediums: Intercom/email, and perhaps w/ an in-house messaging system that also supports text/WhatsApp)",
      'Increase Forum Quality (moderators, volunteers, traffic)',
      "Scale HHM Model w/ HHM's Vetted Graduates",
      'Create professional onboarding videos and onboarding experience (guided tour / emails)',
      'Regularly review the entire website and Chabad Central services (content, emails, hotline, landing pages, features, macros, site menus, apps, etc.) to make lists of minor improvements that must be made to ensure maximum user satisfaction.',
      'Hire a new full-time fundraiser.',
      'People can get through to a human Chabad Central rep during working hours',
      'Replace Rabbi Shafier videos',
      'Figure out our position on the 12 steps',
      "Improve or drop the spouse's department",
      'Have a new handbook',
    ],
  },
  ninety_day: {
    future_date: '2026-04-15',
    revenue: { budget: 625000, profit: null },
    measurables: [
      { name: 'Signups', value: '1,800' },
      { name: 'Donors', value: '1,000' },
      { name: 'First-time phone calls', value: '250' },
      { name: '30 Days Reached', value: '750' },
      { name: 'Very significant help', value: '325' },
    ],
  },
};

const swot = {
  strengths: [],
  weaknesses: [],
  opportunities: [],
  threats: [],
};

// Upsert the singleton V/TO row. If one already exists, update it; otherwise insert.
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
await client.end();
