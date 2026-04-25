import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { presets as presetsTable } from '../schema-drizzle.ts';
import type { DrizzleDB } from '../index.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('seeds');
const __dirname = dirname(fileURLToPath(import.meta.url));

const SEEDS_DIR = __dirname;

interface PresetSeed {
	id: string;
	name: string;
	systemPrompt: string;
	enabledTools: string[];
	commonPrompts: string[];
}

async function loadPresetSeeds(): Promise<PresetSeed[]> {
	const presetsDir = resolve(SEEDS_DIR, 'presets');
	const seeds: PresetSeed[] = [];

	let files: string[];
	try {
		files = await readdir(presetsDir);
	} catch {
		log.warn('no presets seed directory found, skipping');
		return seeds;
	}

	for (const file of files.filter((f) => f.endsWith('.json'))) {
		const content = await readFile(resolve(presetsDir, file), 'utf-8');
		try {
			const parsed = JSON.parse(content) as PresetSeed;
			seeds.push(parsed);
		} catch (err) {
			log.warn(`failed to parse preset seed ${file}:`, err);
		}
	}

	return seeds;
}

async function seedPresets(db: DrizzleDB): Promise<void> {
	const seeds = await loadPresetSeeds();
	if (seeds.length === 0) return;

	for (const seed of seeds) {
		const existing = db.select().from(presetsTable).where(eq(presetsTable.id, seed.id)).get();
		if (existing) {
			log.debug(`preset seed "${seed.id}" already exists, skipping`);
			continue;
		}

		db.insert(presetsTable)
			.values({
				id: seed.id,
				name: seed.name,
				systemPrompt: seed.systemPrompt,
				enabledTools: JSON.stringify(seed.enabledTools),
				commonPrompts: JSON.stringify(seed.commonPrompts),
				createdAt: Date.now(),
				updatedAt: Date.now()
			})
			.run();

		log.info(`seeded preset: ${seed.id} (${seed.name})`);
	}
}

/**
 * Run all database seeds.
 * Idempotent: skips records that already exist.
 * Extend this function to add seeders for new tables in the future.
 */
export async function runSeeds(db: DrizzleDB): Promise<void> {
	await seedPresets(db);
	// Future seeders: await seedConversations(db); await seedSkills(db); etc.
}
