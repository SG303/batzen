import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// The built-in origin check assumes https behind adapter-node. The app is also used over
			// plain http in the home network, so hooks.server.ts runs a protocol-agnostic check instead.
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		// Each test file gets its own fresh database
		env: { DATABASE_PATH: ':memory:' }
	}
});
