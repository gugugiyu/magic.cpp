/**
 * Preset database queries using Drizzle ORM.
 */

import { eq, desc } from 'drizzle-orm';
import { presets as presetsTable } from '../schema-drizzle.ts';
import type { Preset } from '../schema-drizzle.ts';
import type { DrizzleDB } from '../index.ts';

export function createPreset(db: DrizzleDB, preset: Preset): void {
	db.insert(presetsTable).values({
		id: preset.id,
		name: preset.name,
		systemPrompt: preset.systemPrompt,
		enabledTools: preset.enabledTools,
		commonPrompts: preset.commonPrompts,
		createdAt: preset.createdAt,
		updatedAt: preset.updatedAt
	}).run();
}

export function getPreset(db: DrizzleDB, id: string): Preset | undefined {
	const row = db.select().from(presetsTable).where(eq(presetsTable.id, id)).get();
	if (!row) return undefined;
	return row;
}

export function getAllPresets(db: DrizzleDB): Preset[] {
	const rows = db
		.select()
		.from(presetsTable)
		.orderBy(desc(presetsTable.updatedAt))
		.all();
	return rows;
}

export function updatePreset(db: DrizzleDB, id: string, updates: Partial<Omit<Preset, 'id'>>): void {
	const set: Partial<typeof presetsTable.$inferInsert> = {
		updatedAt: Date.now()
	};

	if (updates.name !== undefined) set.name = updates.name;
	if (updates.systemPrompt !== undefined) set.systemPrompt = updates.systemPrompt;
	if (updates.enabledTools !== undefined) set.enabledTools = updates.enabledTools;
	if (updates.commonPrompts !== undefined) set.commonPrompts = updates.commonPrompts;

	db.update(presetsTable).set(set).where(eq(presetsTable.id, id)).run();
}

export function deletePreset(db: DrizzleDB, id: string): void {
	db.delete(presetsTable).where(eq(presetsTable.id, id)).run();
}
