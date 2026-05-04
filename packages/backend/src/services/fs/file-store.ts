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
import { loadConfig } from '../../config';

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

	/** List all matching files recursively (including subdirectories). */
	async listRecursive(): Promise<FileStoreEntry[]> {
		const entries: FileStoreEntry[] = [];

		const scanDir = async (dirPath: string, baseName: string) => {
			try {
				const files = await readdir(dirPath);
				for (const fileName of files) {
					const fullPath = resolve(dirPath, fileName);
					const fileStat = await stat(fullPath);
					if (fileStat.isDirectory()) {
						await scanDir(fullPath, baseName ? `${baseName}/${fileName}` : fileName);
					} else if (fileName.endsWith(this.extension)) {
						const name = baseName
							? `${baseName}/${fileName.slice(0, -this.extension.length)}`
							: fileName.slice(0, -this.extension.length);
						entries.push({
							name,
							path: fullPath,
							lastModified: fileStat.mtime,
							size: fileStat.size
						});
					}
				}
			} catch {
				// Skip directories we can't read
			}
		};

		await scanDir(this.fullPath, '');

		entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
		return entries;
	}

	/**
	 * Apply a line-range patch to a file: replace lines [startLine, endLine] (1-based, inclusive)
	 * with the given replacement text. Reads the current content, splices, and writes back.
	 */
	async patchFile(name: string, startLine: number, endLine: number, replacement: string): Promise<void> {
		const existing = await this.read(name);
		const lines = (existing ?? '').split('\n');
		const before = lines.slice(0, startLine - 1);
		const after = lines.slice(endLine);
		const replacementLines = replacement === '' ? [] : replacement.split('\n');
		const patched = [...before, ...replacementLines, ...after].join('\n');
		await this.write(name, patched);
	}

	/**
	 * Search files in this store for a query string (literal or regex).
	 * Returns formatted match results, capped at maxResults lines.
	 */
	async searchFiles(
		query: string,
		options: { regex?: boolean; caseSensitive?: boolean; maxResults?: number } = {}
	): Promise<string> {
		const { regex = false, caseSensitive = false, maxResults = 50 } = options;
		await this.ensureDirectory();

		let pattern: RegExp;
		try {
			pattern = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
		} catch {
			return `Error: invalid regex pattern: ${query}`;
		}

		const names = await this.listNames();
		const results: string[] = [];

		for (const name of names) {
			const content = await this.read(name);
			if (!content) continue;
			const lines = content.split('\n');
			for (let i = 0; i < lines.length; i++) {
				pattern.lastIndex = 0;
				if (pattern.test(lines[i])) {
					results.push(`${name}${this.extension}:${i + 1}: ${lines[i].trim()}`);
					if (results.length >= maxResults) break;
				}
			}
			if (results.length >= maxResults) break;
		}

		return results.length > 0 ? results.join('\n') : 'No matches found.';
	}
}

/** Pre-configured file store for skills. */
export const skillFileStore = new FileStore({
	directory: '',
	extension: SKILL_FILE_EXTENSION,
	dataDir: resolve(loadConfig().resolvedSkillsFolder)
});

/** Create a FileStore for a specific skill source directory. */
export function createSkillFileStoreForSource(sourcePath: string): FileStore {
	return new FileStore({
		directory: '',  // path is already complete, not a subdirectory
		extension: SKILL_FILE_EXTENSION,
		dataDir: sourcePath
	});
}
