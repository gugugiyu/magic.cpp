/**
 * Database initialization and connection management.
 * Uses bun:sqlite for native SQLite support with WAL mode for thread safety.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { ALL_SCHEMA } from './schema.ts';
import type { Config } from '../config.ts';

let db: Database | null = null;

/**
 * Initialize the SQLite database. Creates tables if they don't exist.
 * Must be called once at server startup.
 */
export function initializeDatabase(config: Config): Database {
	if (db) {
		return db;
	}

	const dbPath = config.resolvedDatabasePath;

	// Ensure parent directory exists
	const dbDir = dirname(dbPath);
	try {
		mkdirSync(dbDir, { recursive: true });
	} catch (err) {
		// Directory might already exist or we don't have permissions
		if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw new Error(`[database] failed to create database directory: ${(err as Error).message}`);
		}
	}

	console.log(`[database] opening SQLite database at ${dbPath}`);

	db = new Database(dbPath, {
		// Create if not exists
		create: true,
		// Read/write mode
		readwrite: true,
	});

	// Enable WAL mode for better concurrent access support
	// WAL allows readers to not block writers and vice versa
	db.run('PRAGMA journal_mode = WAL;');
	
	// Enable foreign key enforcement
	db.run('PRAGMA foreign_keys = ON;');
	
	// Set synchronous to NORMAL for good balance of safety and performance
	// FULL is safest but slower, NORMAL is safe with WAL mode
	db.run('PRAGMA synchronous = NORMAL;');
	
	// Enable busy timeout to handle concurrent access gracefully
	// Wait up to 5 seconds before failing with SQLITE_BUSY
	db.run('PRAGMA busy_timeout = 5000;');

	// Enable aggressive WAL checkpointing
	db.run('PRAGMA wal_autocheckpoint = 1000;');

	// Create tables if they don't exist
	initializeSchema(db);

	console.log('[database] SQLite database initialized successfully');
	return db;
}

/**
 * Run all schema creation statements.
 */
function initializeSchema(database: Database): void {
	for (const sql of ALL_SCHEMA) {
		database.run(sql);
	}
}

/**
 * Get the active database instance.
 * Throws if called before initializeDatabase.
 */
export function getDatabase(): Database {
	if (!db) {
		throw new Error('[database] database not initialized. Call initializeDatabase() first.');
	}
	return db;
}

/**
 * Set the active database instance directly (for testing).
 * Used by E2E tests to inject an in-memory database into the global singleton.
 */
export function setDatabase(database: Database): void {
	db = database;
}

/**
 * Reset the database singleton to null (for testing cleanup).
 * Does NOT close the database - caller is responsible for cleanup.
 */
export function resetDatabase(): void {
	db = null;
}

/**
 * Close the database connection.
 * Called during graceful shutdown.
 */
export function closeDatabase(): void {
	if (db) {
		// Checkpoint WAL before closing
		try {
			db.run('PRAGMA wal_checkpoint(TRUNCATE);');
		} catch (err) {
			console.warn('[database] WAL checkpoint failed:', err);
		}
		
		db.close();
		db = null;
		console.log('[database] SQLite database closed');
	}
}
