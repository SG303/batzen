import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The version comes from package.json; the image build passes the commit (see Dockerfile)
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__APP_COMMIT__: JSON.stringify((process.env.COMMIT ?? '').slice(0, 7))
	},
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
			csrf: { trustedOrigins: ['*'] },
			// Scripts only from the app itself (SvelteKit adds a nonce for its inline start script).
			// Inline styles stay allowed: components position and colour elements with style attributes.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'manifest-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		// Each test file gets its own fresh database
		env: { DATABASE_PATH: ':memory:' }
	}
});
