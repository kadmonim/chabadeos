import { Google, generateState, generateCodeVerifier } from 'arctic';

const siteUrl = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:6133';

export const google = new Google(
  import.meta.env.GOOGLE_CLIENT_ID,
  import.meta.env.GOOGLE_CLIENT_SECRET,
  `${siteUrl}/auth/callback`,
);

export { generateState, generateCodeVerifier };
