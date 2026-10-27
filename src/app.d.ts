// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
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
