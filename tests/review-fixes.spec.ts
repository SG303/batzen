import { expect, test, type APIRequestContext } from '@playwright/test';

const origin = 'http://127.0.0.1:4175';
const credentials = { username: 'regression', password: 'regression-password-123' };
const category = { id: 1, name: 'Test', color: 1, sort: 1 };
const base = { categories: [category], items: [], incomes: [], assets: [], checkIns: [], goals: [], scenarios: [] };
const version = { id: 1, from: '2020-01', amount: 10000, interval: 'monthly', share: 100, dueMonth: null, note: 'First', ended: false };

async function post(request: APIRequestContext, path: string, form: Record<string, string>) {
	const response = await request.post(path, { form, headers: { origin } });
	expect(response.ok()).toBeTruthy();
	return response;
}

async function restore(request: APIRequestContext, data: object) {
	const response = await request.post('/einstellungen?/restore', {
		headers: { origin },
		multipart: { file: { name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) } }
	});
	expect(response.ok()).toBeTruthy();
}

test.beforeAll(async ({ request }) => {
	await post(request, '/einrichten', { ...credentials, repeat: credentials.password });
});

test.beforeEach(async ({ page }) => {
	await post(page.request, '/anmelden', credentials);
});

for (const variant of ['item', 'income', 'asset'] as const) {
	test(`switching ${variant} versions resets fields and saves only the selected version`, async ({ page }) => {
		const versions = [version, { ...version, id: 2, from: '2021-01', amount: 20000, interval: 'yearly', share: 50, dueMonth: 3, note: 'Second' }];
		const data = {
			...base,
			items: variant === 'item' ? [{ id: 1, name: 'Test item', categoryId: 1, kind: 'fixed', assetId: null, reserve: true, versions }] : [],
			incomes: variant === 'income' ? [{ id: 1, name: 'Test income', type: 'salary', counted: true, versions: versions.map((v, i) => ({ ...v, thirteenth: i === 0 })) }] : [],
			assets: variant === 'asset' ? [{ id: 1, name: 'Test asset', type: 'account', provider: null, note: null, versions: versions.map((v) => ({ id: v.id, from: v.from, balance: v.amount, ended: false })) }] : []
		};
		await restore(page.request, data);
		await page.goto(variant === 'asset' ? '/vermoegen' : `/posten${variant === 'income' ? '?tab=einkommen' : ''}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: new RegExp(`Test ${variant}`) }).first().click();
		await page.getByRole('button', { name: 'Eintrag ab Januar 2020 bearbeiten', exact: true }).click();
		await expect(page.locator('#version-amount')).toHaveValue('100');
		await page.locator('#version-amount').fill('999');
		await page.getByRole('button', { name: 'Eintrag ab Januar 2021 bearbeiten', exact: true }).click();
		await expect(page.locator('#version-amount')).toHaveValue('200');
		if (variant !== 'asset') await expect(page.locator('#version-interval')).toHaveValue('yearly');
		if (variant === 'item') {
			await expect(page.locator('#version-note')).toHaveValue('Second');
			await expect(page.locator('#version-due')).toHaveValue('3');
			await expect(page.locator('input[name="share"]').last()).toHaveValue('50');
		}
		await page.locator('#version-amount').fill('250');
		await page.getByRole('button', { name: 'Speichern', exact: true }).click();
		await expect(page.locator('#version-amount')).toHaveCount(0);
		const exported = await (await page.request.get('/export')).json();
		const saved = exported[variant === 'item' ? 'items' : variant === 'income' ? 'incomes' : 'assets'][0].versions;
		expect(saved[0][variant === 'asset' ? 'balance' : 'amount']).toBe(10000);
		expect(saved[1][variant === 'asset' ? 'balance' : 'amount']).toBe(25000);
	});
}

test('scenario categories cannot be deleted and exported data can still be restored', async ({ page }) => {
	await restore(page.request, { ...base, scenarios: [{ id: 1, name: 'Move', note: null, changes: [
		{ type: 'addItem', name: 'Rent', categoryId: 1, kind: 'fixed', amount: 100000, interval: 'monthly', share: 100 }
	] }] });
	await page.goto('/einstellungen');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Kategorie löschen', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('Szenario');
	await expect(page.getByRole('textbox', { name: 'Name der Kategorie' })).toHaveValue('Test');
	const exported = await (await page.request.get('/export')).json();
	await restore(page.request, exported);
	const restored = await (await page.request.get('/export')).json();
	expect(restored.scenarios).toEqual(exported.scenarios);
	expect(restored.categories).toEqual(exported.categories);
	await page.goto('/planen/1');
	await expect(page.getByRole('heading', { name: 'Move', exact: true })).toBeVisible();
});

test('a deficit does not make a saving goal appear affordable', async ({ page }) => {
	const today = new Date();
	const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
	await restore(page.request, {
		...base,
		items: [
			{ id: 1, name: 'Expenses', categoryId: 1, kind: 'fixed', assetId: null, reserve: true, versions: [{ ...version, amount: 100000 }] },
			{ id: 2, name: 'Saving', categoryId: 1, kind: 'saving', assetId: null, reserve: true, versions: [{ ...version, id: 2, amount: 50000 }] }
		],
		incomes: [{ id: 1, name: 'Salary', type: 'salary', counted: true, versions: [{ ...version, amount: 100000, thirteenth: false }] }],
		goals: [{ id: 1, name: 'Trip', target: 50000, saved: 0, assetId: null, due: month }]
	});
	await page.goto('/planen');
	await expect(page.getByRole('heading', { name: 'Für «Trip» reicht das Spartempo noch nicht.' })).toBeVisible();
	await expect(page.getByText('Im Moment fliesst nichts in dieses Ziel.', { exact: false })).toBeVisible();
	await expect(page.getByText('Zu langsam', { exact: true })).toBeVisible();
});

test('asset-only historical snapshots and year reviews remain accessible', async ({ page }) => {
	const asset = { id: 1, name: 'Historical account', type: 'account', provider: null, note: null };
	await restore(page.request, {
		...base,
		assets: [{ ...asset, versions: [{ id: 1, from: '2024-01', balance: 200000, ended: false }] }],
		checkIns: [{ id: 1, asOf: '2021-05', completedAt: '2026-01-01', note: 'Historical check-in', snapshot: {
			asOf: '2021-05', categories: [category], items: [], incomes: [], assets: [{ ...asset, balance: 123400 }]
		} }]
	});
	await page.goto('/?jahr=2021&stand=1');
	await expect(page.getByText('So sah es beim Check-in im Mai 2021 aus.')).toBeVisible();
	await expect(page.getByText('Historical check-in', { exact: true })).toBeVisible();
	await expect(page.getByText(/^1['’]234$/).first()).toBeVisible();
	const review = await page.goto('/verlauf/2021');
	expect(review?.status()).toBe(200);
	await expect(page.getByText('Historical check-in', { exact: true })).toBeVisible();
	await page.goto('/?jahr=2024');
	await expect(page.getByRole('group', { name: 'Jahr wählen' })).toContainText('2024');
	await expect(page.getByRole('heading', { name: 'Vermögen', exact: true })).toBeVisible();
});
