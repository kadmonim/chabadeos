/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
  readonly SESSION_SECRET: string;
  readonly PUBLIC_SITE_URL: string;
  readonly CHABADEOS_API_KEYS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type TeamRecord = { id: string; name: string; description: string | null };

declare namespace App {
  interface Locals {
    user: { email: string; employeeId: string; fullName: string } | null;
    allowedTeams: TeamRecord[];
    currentTeam: TeamRecord | null;
  }
}
