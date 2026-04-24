/**
 * Database initialization and connection management.
 * Uses drizzle-orm/bun-sqlite with WAL mode and automatic migrations.
 */

import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import * as schema from './schema-drizzle.ts';
import type { Config } from '../config.ts';
import { seedBuiltInSkills } from '../services/skill-io.ts';

export type DrizzleDB = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_FOLDER = resolve(__dirname, './migrations/drizzle');

let rawDb: Database | null = null;
let db: DrizzleDB | null = null;

/**
 * Seed a default preset if the presets table is empty.
 * Called at database initialization time.
 */
async function seedDefaultPreset(db: DrizzleDB): Promise<void> {
	const existing = db.select().from(schema.presets).limit(1).get();
	if (existing) return;

	db.insert(schema.presets)
		.values({
			id: 'default',
			name: 'Default',
			systemPrompt: '',
			enabledTools: '[]',
			commonPrompts: '[]',
			createdAt: Date.now(),
			updatedAt: Date.now()
		})
		.run();

	console.log('[database] seeded default preset');
}

/**
 * Initialize the SQLite database. Runs pending migrations automatically.
 * Must be called once at server startup.
 */
export function initializeDatabase(config: Config): DrizzleDB {
	if (db) return db;

	const dbPath = config.resolvedDatabasePath;
	const dbDir = dirname(dbPath);

	try {
		mkdirSync(dbDir, { recursive: true });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw new Error(`[database] failed to create database directory: ${(err as Error).message}`);
		}
	}

	console.log(`[database] opening SQLite database at ${dbPath}`);

	rawDb = new Database(dbPath, { create: true, readwrite: true });

	// Set PRAGMAs on the raw connection before wrapping with Drizzle
	rawDb.run('PRAGMA journal_mode = WAL;');
	rawDb.run('PRAGMA foreign_keys = ON;');
	rawDb.run('PRAGMA synchronous = NORMAL;');
	rawDb.run('PRAGMA busy_timeout = 5000;');
	rawDb.run('PRAGMA wal_autocheckpoint = 1000;');

	db = drizzle(rawDb, { schema });

	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

	// Seed built-in skills (harmless re-seed if already exist)
	seedBuiltInSkills().catch((err) => {
		console.warn('[database] built-in skills seed failed:', err);
	});

	// Seed a default preset if the table is empty
	seedDefaultPreset(db).catch((err) => {
		console.warn('[database] default preset seed failed:', err);
	});

	console.log('[database] SQLite database initialized successfully');
	return db;
}

/**
 * Get the active database instance.
 * Throws if called before initializeDatabase.
 */
export function getDatabase(): DrizzleDB {
	if (!db) {
		throw new Error('[database] database not initialized. Call initializeDatabase() first.');
	}
	return db;
}

/**
 * Close the database connection.
 * Called during graceful shutdown.
 */
export function closeDatabase(): void {
	if (rawDb) {
		try {
			rawDb.run('PRAGMA wal_checkpoint(TRUNCATE);');
		} catch (err) {
			console.warn('[database] WAL checkpoint failed:', err);
		}

		rawDb.close();
		rawDb = null;
		db = null;
		console.log('[database] SQLite database closed');
	}
}
