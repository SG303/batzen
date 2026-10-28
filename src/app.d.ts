// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** Set at build time in vite.config.ts */
	const __APP_VERSION__: string;
	const __APP_COMMIT__: string;

	namespace App {
		interface Locals {
			theme: import('#lib/theme.ts').Theme;
			/** Privacy mode, see privacy.svelte.ts */
			privacy: boolean;
			user: (import('#lib/server/auth.ts').User & { sessionId: string }) | null;
		}
	}
}

export {};
