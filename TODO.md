# TODO

## Set up Google OAuth

Login is blocked until this is done.

1. Create an OAuth 2.0 Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — type "Web application".
2. Authorized redirect URI: `http://localhost:7703/auth/callback`
3. Paste the client ID + secret into `app/.env`:
   - `GOOGLE_CLIENT_ID=`
   - `GOOGLE_CLIENT_SECRET=`

## Set up API token

Required to call any `/api/v1/*` machine endpoint (e.g. external scripts posting issues/todos). Without it, those endpoints return `500 — CHABADEOS_API_KEYS env var not configured`.

1. Generate a random token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Paste it into `app/.env`:
   - `CHABADEOS_API_KEYS=<token>`
3. Callers send it as: `Authorization: Bearer <token>`. Multiple tokens can be comma-separated.
