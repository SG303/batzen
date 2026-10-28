import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import type { Theme } from '#lib/theme.ts';
import { PRIVACY_COOKIE } from '#lib/privacy.svelte.ts';
import { hasUsers, SESSION_COOKIE, validateSession } from '#lib/server/auth.ts';
import { startBackups } from '#lib/server/backup.ts';

export const init: ServerInit = () => startBackups();

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Pages reachable without a session. Static files are served before this hook runs. */
const PUBLIC = new Set(['/anmelden', '/einrichten']);

/**
 * Sent with every response from the app (the Content-Security-Policy is configured in vite.config.ts).
 * No other site may embed the app in a frame, so nobody can trick a click on a hidden button.
 */
const SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'same-origin',
	'cross-origin-opener-policy': 'same-origin'
};

/** Rejects form posts from other sites: the Origin host must match the requested host. */
function isCrossSite(request: Request, url: URL): boolean {
	if (!MUTATING.has(request.method)) return false;
	const origin = request.headers.get('origin');
	if (!origin) return true;
	try {
		return new URL(origin).host !== url.host;
	} catch {
		return true;
	}
}

/** Path to return to after logging in; data requests map back to their page. */
function returnTo(url: URL): string {
	const path = url.pathname.replace(/\/?__data\.json$/, '') || '/';
	return path === '/' ? '' : `?ziel=${encodeURIComponent(path + url.search)}`;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (isCrossSite(event.request, event.url)) {
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	}

	const cookie = event.cookies.get('theme');
	const theme: Theme = cookie === 'light' || cookie === 'dark' ? cookie : 'system';
	event.locals.theme = theme;
	event.locals.privacy = event.cookies.get(PRIVACY_COOKIE) === '1';

	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? validateSession(token) : null;

	const path = event.url.pathname.replace(/\/?__data\.json$/, '') || '/';
	if (!event.locals.user && !PUBLIC.has(path)) {
		redirect(303, hasUsers() ? `/anmelden${returnTo(event.url)}` : '/einrichten');
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%theme.attr%', theme === 'system' ? '' : `data-theme="${theme}"`)
				.replace('%privacy.attr%', event.locals.privacy ? 'data-privacy' : '')
	});
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
	return response;
};
