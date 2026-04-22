import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/database/schema-drizzle.ts',
	out: './src/database/migrations/drizzle',
	driver: 'bun:sqlite',
	db: {
		url: 'file:./data/chat.db'
	}
});