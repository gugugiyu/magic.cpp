/**
 * Abstract file-system store for persistent file-based resources.
 *
 * Provides a reusable I/O layer that can be used by skills,
 * and future filesystem-based built-in tools (e.g., snippets, templates).
 *
 * Uses Bun's native file APIs for performance.
 */

import { SKILLS_DIRECTORY, SKILL_FILE_EXTENSION, sanitizeSkillName } from '#shared/constants/skills';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdir, stat } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Configuration for a file store instance. */
export interface FileStoreConfig {
	/** Directory name under the data root (e.g., 'skills'). */
	directory: string;

	/** File extension for items in this store (e.g., '.md'). */
	extension: string;

	/** Base data directory path on disk. */
	dataDir: string;
}

/** Metadata about a file in the store. */
export interface FileStoreEntry {
	/** Name without extension (unique identifier). */
	name: string;

	/** Full file path. */
	path: string;

	/** Last modified timestamp. */
	lastModified: Date;

	/** File size in bytes. */
	size: number;
}

/**
 * Generic file-system store for managing files in a specific directory.
 * Each store is scoped to a single directory and file extension.
 */
export class FileStore {
	private readonly directory: string;
	private readonly extension: string;
	private readonly dataDir: string;
	private readonly fullPath: string;

	constructor(config: FileStoreConfig) {
		this.directory = config.directory;
		this.extension = config.extension;
		this.dataDir = config.dataDir;
		this.fullPath = resolve(this.dataDir, this.directory);
	}

	/** Get the store's root directory path. */
	get rootPath(): string {
		return this.fullPath;
	}

	/** Ensure the store's directory exists on disk. */
	async ensureDirectory(): Promise<void> {
		const dirExists = await Bun.file(`${this.fullPath}/.check`).exists()
			.then(() => true)
			.catch(() => false);
		if (!dirExists) {
			await Bun.write(`${this.fullPath}/.gitkeep`, '');
			try {
				await Bun.file(`${this.fullPath}/.gitkeep`).delete();
			} catch {
				// .gitkeep may not exist, ignore
			}
		}
	}

	/** Resolve a file path from a name (adds extension). */
	private resolvePath(name: string): string {
		if (name.includes('..')) {
			throw new Error('Invalid skill name: path traversal not allowed');
		}
		const sanitizedName = sanitizeSkillName(name);
		return resolve(this.fullPath, `${sanitizedName}${this.extension}`);
	}

	/** Check if a file exists in this store. */
	async exists(name: string): Promise<boolean> {
		const file = Bun.file(this.resolvePath(name));
		return await file.exists();
	}

	/** Read a file's content as text. Returns null if not found. */
	async read(name: string): Promise<string | null> {
		const file = Bun.file(this.resolvePath(name));
		if (!(await file.exists())) {
			return null;
		}
		return await file.text();
	}

	/** Write content to a file, creating or overwriting. */
	async write(name: string, content: string): Promise<void> {
		await this.ensureDirectory();
		await Bun.write(this.resolvePath(name), content);
	}

	/** Delete a file from the store. Returns true if deleted, false if not found. */
	async delete(name: string): Promise<boolean> {
		const file = Bun.file(this.resolvePath(name));
		if (!(await file.exists())) {
			return false;
		}
		await file.delete();
		return true;
	}

	/** List all files in this store (returns FileStoreEntry array). */
	async list(): Promise<FileStoreEntry[]> {
		await this.ensureDirectory();

		const entries: FileStoreEntry[] = [];

		try {
			const files = await readdir(this.fullPath);

			for (const fileName of files) {
				if (fileName.endsWith(this.extension)) {
					const name = fileName.slice(0, -this.extension.length);
					const filePath = resolve(this.fullPath, fileName);
					const fileStat = await stat(filePath);
					entries.push({
						name: sanitizeSkillName(name),
						path: filePath,
						lastModified: fileStat.mtime,
						size: fileStat.size
					});
				}
			}
		} catch {
			// Directory may not exist yet, return empty
			return [];
		}

		// Sort by last modified (newest first)
		entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
		return entries;
	}

	/** List all file names (without extension) as a simple string array. */
	async listNames(): Promise<string[]> {
		const entries = await this.list();
		return entries.map((e) => e.name);
	}
}

/** Resolve the backend data directory path. */
function resolveDataDir(): string {
	return resolve(__dirname, '..', '..', 'data');
}

/** Pre-configured file store for skills. */
export const skillFileStore = new FileStore({
	directory: SKILLS_DIRECTORY,
	extension: SKILL_FILE_EXTENSION,
	dataDir: resolveDataDir()
});
