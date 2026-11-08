// ESLint flat config (SG303 baseline: ESLint for Node/TypeScript projects).
// Recommended rules for JavaScript, TypeScript and Svelte; type checking
// itself stays with svelte-check (`npm run check`).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
	{
		ignores: [
			'.svelte-kit/',
			'build/',
			'data/',
			'node_modules/',
			'playwright-report/',
			'test-results/'
		]
	},
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// TypeScript already reports undefined names, including types.
			'no-undef': 'off',
			// A leading underscore marks a value that is unused on purpose.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			// The app has no paths.base, so plain links are already correct.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		// Tests build partial fixtures and poke at internals.
		files: ['**/*.test.ts', 'tests/**'],
		rules: { '@typescript-eslint/no-explicit-any': 'off' }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	}
);
