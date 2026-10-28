import { sqliteTable, integer, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** Palette slot 1–8, see app.css */
	color: integer('color').notNull(),
	sort: integer('sort').notNull().default(0)
});

export const items = sqliteTable('items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => categories.id),
	/** 'fixed' | 'variable' | 'saving' */
	kind: text('kind').notNull().default('fixed'),
	/** Saving items only: the asset the money goes into */
	assetId: integer('asset_id').references((): AnySQLiteColumn => assets.id, { onDelete: 'set null' }),
	/** Counts towards the monthly reserve; only applies while the interval is not monthly */
	reserve: integer('reserve', { mode: 'boolean' }).notNull().default(true)
});

/**
 * An item's amount is a timeline: each version applies from its month until the next one.
 * Amounts are stored in Rappen.
 */
export const itemVersions = sqliteTable(
	'item_versions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		itemId: integer('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		/** 'YYYY-MM' */
		from: text('valid_from').notNull(),
		amount: integer('amount').notNull().default(0),
		/** 'monthly' | 'quarterly' | 'semiannual' | 'yearly' */
		interval: text('interval').notNull().default('monthly'),
		/** Own share in percent (0–100) */
		share: integer('share').notNull().default(100),
		/** Month of the year (1–12) of a payment, the others follow the interval. Optional, never for monthly */
		dueMonth: integer('due_month'),
		/** Free text that applies from this month, e.g. the provider or what the bundle includes */
		note: text('note'),
		ended: integer('ended', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [uniqueIndex('item_versions_item_from').on(t.itemId, t.from)]
);

export const incomeSources = sqliteTable('income_sources', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** 'salary' | 'bonus' | 'expenses' | 'other' */
	type: text('type').notNull().default('salary'),
	/** Counts towards the budget */
	counted: integer('counted', { mode: 'boolean' }).notNull().default(true)
});

export const incomeVersions = sqliteTable(
	'income_versions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sourceId: integer('source_id')
			.notNull()
			.references(() => incomeSources.id, { onDelete: 'cascade' }),
		from: text('valid_from').notNull(),
		amount: integer('amount').notNull().default(0),
		/** 'monthly' | 'yearly' */
		interval: text('interval').notNull().default('monthly'),
		/** Paid 13 times a year */
		thirteenth: integer('thirteenth', { mode: 'boolean' }).notNull().default(false),
		ended: integer('ended', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [uniqueIndex('income_versions_source_from').on(t.sourceId, t.from)]
);

export const assets = sqliteTable('assets', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** 'account' | 'pillar3a' | 'pension' | 'securities' | 'crypto' | 'other' */
	type: text('type').notNull().default('account'),
	/** Where the money is held (bank, broker, pension fund) */
	provider: text('provider'),
	/** What is inside, e.g. "Global ETF, Gold ETF" */
	note: text('note')
});

/** An asset's balance is a timeline: each version applies from its month until the next one. */
export const assetVersions = sqliteTable(
	'asset_versions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		assetId: integer('asset_id')
			.notNull()
			.references(() => assets.id, { onDelete: 'cascade' }),
		/** 'YYYY-MM' */
		from: text('valid_from').notNull(),
		/** Rappen */
		balance: integer('balance').notNull().default(0),
		/** The asset was closed from this month on */
		ended: integer('ended', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [uniqueIndex('asset_versions_asset_from').on(t.assetId, t.from)]
);

/** A savings goal: a target amount by a month, measured on an asset or on an amount entered by hand. */
export const goals = sqliteTable('goals', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** Rappen */
	target: integer('target').notNull(),
	/** 'YYYY-MM' */
	due: text('due').notNull(),
	/** The progress is this asset's balance; without one it is `saved` */
	assetId: integer('asset_id').references(() => assets.id, { onDelete: 'set null' }),
	/** Rappen, entered by hand for goals without an asset */
	saved: integer('saved').notNull().default(0)
});

/** A "what if" scenario: changes applied to a copy of the current budget, never to the budget itself. */
export const scenarios = sqliteTable('scenarios', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	note: text('note'),
	/** JSON array of domain `ScenarioChange` */
	changes: text('changes').notNull().default('[]')
});

export const checkIns = sqliteTable('check_ins', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	asOf: text('as_of').notNull(),
	completedAt: text('completed_at').notNull(),
	note: text('note'),
	/** JSON of the frozen state (domain `Snapshot`) */
	snapshot: text('snapshot')
});

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Stored lowercase; login is case-insensitive */
	username: text('username').notNull().unique(),
	/** scrypt$<salt>$<hash>, see auth.ts */
	passwordHash: text('password_hash').notNull(),
	createdAt: text('created_at').notNull(),
	lastLoginAt: text('last_login_at')
});

/** A login on one device. Only the SHA-256 of the cookie token is stored. */
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	/** Epoch milliseconds; extended on use */
	expiresAt: integer('expires_at').notNull()
});
