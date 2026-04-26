import { join, relative, isAbsolute } from 'path';
import { readdir, stat } from 'node:fs/promises';
import type { Config } from '../config.ts';
import { sandboxPath, isBinaryExtension, hasBinaryBytes } from '../utils/sandbox.ts';
import { HEURISTIC_BANNED } from '#shared/constants/filesystem.ts';
import * as Diff from 'diff';

const MAX_TREE_DEPTH = 10;
const MAX_TREE_FILES = 5000;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_FILES_PER_DIR = 2000;

interface FileSystemNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	size?: number;
	children?: FileSystemNode[];
}

type IgnoreMatcher = (name: string, relPath: string) => boolean;

function isProbablyMinified(name: string): boolean {
	return name.endsWith('.min.js') || name.endsWith('.min.css');
}

/**
 * Compile a .gitignore file into a list of fast matchers.
 *
 * Supported patterns:
 * - Literal names (e.g. `node_modules`, `dist`)
 * - Simple extension wildcards (e.g. `*.log`)
 * - Simple prefix wildcards (e.g. `temp*`)
 * - Simple path patterns with `/` (e.g. `src/generated`)
 *
 * Complex patterns (negation, `?`, `**`) are skipped for performance.
 */
function compileGitignore(content: string): IgnoreMatcher[] {
	const matchers: IgnoreMatcher[] = [];

	for (const raw of content.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#') || line.startsWith('!')) continue;

		const isDirOnly = line.endsWith('/');
		const pattern = isDirOnly ? line.slice(0, -1) : line;

		// Skip patterns with complex wildcards
		if (pattern.includes('?') || pattern.includes('**')) continue;

		if (pattern.includes('/')) {
			// Path-aware suffix matching
			matchers.push((name, relPath) => relPath === pattern || relPath.endsWith('/' + pattern));
			continue;
		}

		if (!pattern.includes('*')) {
			// Literal name match
			matchers.push((name) => name === pattern);
			continue;
		}

		// Simple suffix wildcard: *.ext
		if (pattern.startsWith('*.') && pattern.indexOf('*', 2) === -1) {
			const ext = pattern.slice(1);
			matchers.push((name) => name.endsWith(ext));
			continue;
		}

		// Simple prefix wildcard: prefix*
		if (pattern.endsWith('*') && pattern.indexOf('*') === pattern.length - 1) {
			const prefix = pattern.slice(0, -1);
			matchers.push((name) => name.startsWith(prefix));
			continue;
		}
	}

	return matchers;
}

async function loadGitignoreMatchers(dirPath: string): Promise<IgnoreMatcher[]> {
	try {
		const text = await Bun.file(join(dirPath, '.gitignore')).text();
		return compileGitignore(text);
	} catch {
		return [];
	}
}

function isIgnored(name: string, relPath: string, matchers: IgnoreMatcher[]): boolean {
	if (HEURISTIC_BANNED.has(name)) return true;
	if (isProbablyMinified(name)) return true;
	for (const matcher of matchers) {
		if (matcher(name, relPath)) return true;
	}
	return false;
}

async function buildTree(
	dirPath: string,
	relativeBase: string,
	depth: number,
	maxDepth: number,
	fileCount: { value: number },
	parentMatchers: IgnoreMatcher[]
): Promise<FileSystemNode[]> {
	if (depth > MAX_TREE_DEPTH || fileCount.value >= MAX_TREE_FILES) {
		return [];
	}

	const localMatchers = await loadGitignoreMatchers(dirPath);
	const allMatchers = localMatchers.length > 0 ? [...parentMatchers, ...localMatchers] : parentMatchers;

	let entries: string[];
	try {
		entries = await readdir(dirPath);
	} catch {
		return [];
	}

	// Directory explosion protection — return collapsed directory sentinel
	if (entries.length > MAX_FILES_PER_DIR) {
		const dirRelPath = relative(relativeBase, dirPath) || '.';
		return [{
			name: dirRelPath,
			path: dirRelPath,
			type: 'directory',
			children: []
		}];
	}

	// Lightweight prioritization
	entries.sort((a, b) => {
		const priority = (name: string) =>
			name === 'package.json' ? 0 :
			name === 'README.md' ? 1 :
			name === 'tsconfig.json' ? 2 :
			name === 'Cargo.toml' ? 2 :
			3;
		return priority(a) - priority(b) || a.localeCompare(b);
	});

	const visibleEntries: { name: string; relPath: string; fullPath: string }[] = [];
	for (const entry of entries) {
		if (fileCount.value >= MAX_TREE_FILES) break;
		const fullPath = join(dirPath, entry);
		const relPath = relative(relativeBase, fullPath);
		if (isIgnored(entry, relPath, allMatchers)) continue;
		visibleEntries.push({ name: entry, relPath, fullPath });
	}

	// Parallel stat for performance
	const stats = await Promise.allSettled(
		visibleEntries.map(e => stat(e.fullPath))
	);

	const nodes: FileSystemNode[] = [];

	for (let i = 0; i < visibleEntries.length; i++) {
		if (fileCount.value >= MAX_TREE_FILES) break;

		const { name: entry, relPath, fullPath } = visibleEntries[i];
		const statResult = stats[i];

		if (statResult.status === 'rejected') continue;
		const s = statResult.value;

		if (s.isDirectory()) {
			if (depth + 1 > maxDepth) {
				// Lazy boundary — directory is listed but children are deferred
				nodes.push({
					name: entry,
					path: relPath,
					type: 'directory'
				});
			} else {
				const children = await buildTree(fullPath, relativeBase, depth + 1, maxDepth, fileCount, allMatchers);
				if (children.length === 1 && children[0].path === relPath && children[0].type === 'directory') {
					// Directory was too large — show as collapsed
					nodes.push({
						name: entry,
						path: relPath,
						type: 'directory'
					});
				} else {
					nodes.push({
						name: entry,
						path: relPath,
						type: 'directory',
						children
					});
				}
			}
		} else if (s.isFile()) {
			if (s.size > MAX_FILE_SIZE) continue;
			if (isBinaryExtension(entry)) continue;

			fileCount.value++;
			nodes.push({
				name: entry,
				path: relPath,
				type: 'file',
				size: s.size
			});
		}
	}

	return nodes;
}

export async function handleFileSystem(req: Request, config: Config): Promise<Response> {
	try {
		const url = new URL(req.url);
		const rawPath = url.searchParams.get('path') ?? '';
		const rootPath = config.resolvedFilesystemRootPath;

		let targetPath: string;
		if (rawPath) {
			targetPath = await sandboxPath(rawPath, rootPath);
		} else {
			targetPath = rootPath;
		}

		const fileCount = { value: 0 };
		const tree = await buildTree(targetPath, rootPath, 0, 2, fileCount, []);
		return Response.json({ tree, fileCount: fileCount.value });
	} catch (err) {
		return Response.json({ error: (err as Error).message }, { status: 500 });
	}
}

export async function handleFileSystemDiff(req: Request, config: Config): Promise<Response> {
	let body: { path?: unknown; content?: unknown };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const path = String(body.path ?? '');
	const newContent = String(body.content ?? '');

	if (!path) {
		return Response.json({ error: 'path is required' }, { status: 400 });
	}

	try {
		const fullPath = await sandboxPath(path, config.resolvedFilesystemRootPath);
		const file = Bun.file(fullPath);

		let oldContent = '';
		if (await file.exists()) {
			if (isBinaryExtension(fullPath) || (await hasBinaryBytes(fullPath))) {
				return Response.json({ error: 'cannot diff binary file' }, { status: 400 });
			}
			oldContent = await file.text();
		}

		const diff = Diff.diffLines(oldContent, newContent);
		let insertions = 0;
		let deletions = 0;

		for (const part of diff) {
			if (part.added) {
				insertions += part.value.split('\n').length - 1;
			} else if (part.removed) {
				deletions += part.value.split('\n').length - 1;
			}
		}

		return Response.json({ insertions, deletions });
	} catch (err) {
		return Response.json({ error: (err as Error).message }, { status: 500 });
	}
}
