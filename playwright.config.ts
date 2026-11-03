import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	workers: 1,
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	use: {
		baseURL: 'http://127.0.0.1:4175',
		launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
	},
	webServer: {
		command: 'npm run build && node build',
		url: 'http://127.0.0.1:4175/einrichten',
		env: { DATABASE_PATH: ':memory:', BACKUP_DIR: '', HOST: '127.0.0.1', PORT: '4175' },
		timeout: 120_000,
		reuseExistingServer: false
	}
});
