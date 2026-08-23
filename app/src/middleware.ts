import { defineMiddleware } from 'astro:middleware';
import { readSession } from '~/lib/session';
import { fetchAllowedTeams, resolveCurrentTeam } from '~/lib/team';
import { getUiPrefs } from '~/lib/prefs';

// /rooms/open is the view-only room availability page: busy/free times with no
// details, deliberately readable without a login.
const PUBLIC_PATHS = new Set<string>(['/login', '/auth/google', '/auth/callback', '/rooms/open']);

export const onRequest = defineMiddleware(async (context, next) => {
  const session = await readSession(context.cookies);
  context.locals.user = session;
  context.locals.allowedTeams = [];
  context.locals.currentTeam = null;
  context.locals.uiPrefs = {};

  const path = context.url.pathname;
  const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/_');
  // Machine API has its own Bearer-token auth; skip the cookie-based gate.
  const isMachineApi = path.startsWith('/api/v1');

  if (!session && !isPublic && !isMachineApi) {
    return context.redirect('/login');
  }
  if (session && path === '/login') {
    return context.redirect('/');
  }

  if (session) {
    const [allowed, prefs] = await Promise.all([
      fetchAllowedTeams(session.employeeId),
      getUiPrefs(session.employeeId),
    ]);
    context.locals.allowedTeams = allowed;
    context.locals.currentTeam = resolveCurrentTeam(context.cookies, allowed);
    context.locals.uiPrefs = prefs;
  }

  return next();
});
