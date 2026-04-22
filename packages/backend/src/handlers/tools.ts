import { resolve, normalize, join, relative, basename, dirname } from 'path';
import { readdir, stat, rename, mkdir } from 'node:fs/promises';
import type { Config } from '../config.ts';

type BackendToolHandler = (args: Record<string, unknown>, config: Config) => Promise<string>;

const BINARY_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tiff',
	'.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
	'.exe', '.dll', '.so', '.dylib',
	'.mp3', '.mp4', '.wav', '.ogg', '.flac',
	'.woff', '.woff2', '.ttf', '.otf',
	'.db', '.sqlite', '.sqlite3',
]);

function sandboxPath(rawPath: string, rootPath: string): string {
	const normalized = normalize(rawPath.replace(/\\/g, '/'));
	if (normalized.includes('..')) throw new Error('Path traversal is not allowed');
	const full = resolve(rootPath, normalized);
	// Ensure the resolved path is still inside rootPath
	const rel = relative(rootPath, full);
	if (rel.startsWith('..') || resolve(rel) === resolve(rootPath, '..')) {
		throw new Error('Path escapes sandbox root');
	}
	return full;
}

function isBinaryExtension(filePath: string): boolean {
	const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
	return BINARY_EXTENSIONS.has(ext);
}

function hasBinaryBytes(content: string): boolean {
	for (let i = 0; i < Math.min(content.length, 8192); i++) {
		if (content.charCodeAt(i) === 0) return true;
	}
	return false;
}

async function ensureParentDir(filePath: string): Promise<void> {
	const parent = dirname(filePath);
	await mkdir(parent, { recursive: true });
}

const BACKEND_TOOL_HANDLERS: Record<string, BackendToolHandler> = {
	async read_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return 'Error: path is required';
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);
		if (isBinaryExtension(full)) return `Error: refusing to read binary file: ${path}`;
		const file = Bun.file(full);
		if (!(await file.exists())) return `Error: file not found: ${path}`;
		const content = await file.text();
		if (hasBinaryBytes(content)) return `Error: file appears to be binary: ${path}`;
		const startLine = args.start_line != null ? Number(args.start_line) : undefined;
		const endLine = args.end_line != null ? Number(args.end_line) : undefined;
		if (startLine !== undefined || endLine !== undefined) {
			const lines = content.split('\n');
			const start = Math.max(1, startLine ?? 1);
			const end = Math.min(lines.length, endLine ?? lines.length);
			return lines.slice(start - 1, end).join('\n');
		}
		return content;
	},

	async write_file(args, config) {
		const path = String(args.path ?? '');
		const content = String(args.content ?? '');
		if (!path) return 'Error: path is required';
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);
		await ensureParentDir(full);
		await Bun.write(full, content);
		return `Written ${content.length} chars to ${path}`;
	},

	async patch_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return 'Error: path is required';
		const startLine = Number(args.start_line ?? 0);
		const endLine = Number(args.end_line ?? 0);
		const replacement = String(args.replacement ?? '');
		if (!startLine || !endLine) return 'Error: start_line and end_line are required';
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);
		const file = Bun.file(full);
		if (!(await file.exists())) return `Error: file not found: ${path}`;
		const existing = await file.text();
		const lines = existing.split('\n');
		const before = lines.slice(0, startLine - 1);
		const after = lines.slice(endLine);
		const replacementLines = replacement === '' ? [] : replacement.split('\n');
		const patched = [...before, ...replacementLines, ...after].join('\n');
		await Bun.write(full, patched);
		return `Patched ${path}: replaced lines ${startLine}-${endLine} with ${replacementLines.length} line(s)`;
	},

	async list_directory(args, config) {
		const path = String(args.path ?? '.');
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);
		let entries: string[];
		try {
			entries = await readdir(full);
		} catch {
			return `Error: directory not found or not accessible: ${path}`;
		}
		const lines: string[] = [];
		for (const entry of entries.sort()) {
			try {
				const s = await stat(join(full, entry));
				const type = s.isDirectory() ? 'dir' : 'file';
				const size = s.isFile() ? ` (${s.size}B)` : '';
				lines.push(`${type}  ${entry}${size}`);
			} catch {
				lines.push(`?     ${entry}`);
			}
		}
		return lines.length > 0 ? lines.join('\n') : '(empty directory)';
	},

	async search_files(args, config) {
		const path = String(args.path ?? '.');
		const query = String(args.query ?? '');
		if (!query) return 'Error: query is required';
		const useRegex = Boolean(args.regex ?? false);
		const caseSensitive = Boolean(args.case_sensitive ?? false);
		const maxResults = Math.min(Number(args.max_results ?? 50), 200);
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);

		let pattern: RegExp;
		try {
			const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
		} catch {
			return `Error: invalid regex pattern: ${query}`;
		}

		const results: string[] = [];

		async function walkDir(dir: string): Promise<void> {
			if (results.length >= maxResults) return;
			let dirEntries: string[];
			try {
				dirEntries = await readdir(dir);
			} catch {
				return;
			}
			for (const entry of dirEntries) {
				if (results.length >= maxResults) break;
				const entryPath = join(dir, entry);
				let s: Awaited<ReturnType<typeof stat>>;
				try {
					s = await stat(entryPath);
				} catch {
					continue;
				}
				if (s.isDirectory()) {
					await walkDir(entryPath);
				} else if (s.isFile() && !isBinaryExtension(entryPath)) {
					const file = Bun.file(entryPath);
					let content: string;
					try {
						content = await file.text();
					} catch {
						continue;
					}
					if (hasBinaryBytes(content)) continue;
					const relPath = relative(config.resolvedFilesystemRootPath, entryPath);
					const lines = content.split('\n');
					for (let i = 0; i < lines.length && results.length < maxResults; i++) {
						pattern.lastIndex = 0;
						if (pattern.test(lines[i])) {
							results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
						}
					}
				}
			}
		}

		const s = await stat(full).catch(() => null);
		if (!s) return `Error: path not found: ${path}`;
		if (s.isDirectory()) {
			await walkDir(full);
		} else {
			const file = Bun.file(full);
			const content = await file.text().catch(() => '');
			const relPath = relative(config.resolvedFilesystemRootPath, full);
			const lines = content.split('\n');
			for (let i = 0; i < lines.length && results.length < maxResults; i++) {
				pattern.lastIndex = 0;
				if (pattern.test(lines[i])) {
					results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
				}
			}
		}

		return results.length > 0 ? results.join('\n') : 'No matches found.';
	},

	async delete_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return 'Error: path is required';
		const full = sandboxPath(path, config.resolvedFilesystemRootPath);
		const file = Bun.file(full);
		if (!(await file.exists())) return `Error: file not found: ${path}`;
		await file.delete();
		return `Deleted ${path}`;
	},

	async move_file(args, config) {
		const srcPath = String(args.source ?? '');
		const destPath = String(args.destination ?? '');
		if (!srcPath || !destPath) return 'Error: source and destination are required';
		const srcFull = sandboxPath(srcPath, config.resolvedFilesystemRootPath);
		const destFull = sandboxPath(destPath, config.resolvedFilesystemRootPath);
		const file = Bun.file(srcFull);
		if (!(await file.exists())) return `Error: source not found: ${srcPath}`;
		await ensureParentDir(destFull);
		await rename(srcFull, destFull);
		return `Moved ${srcPath} → ${destPath}`;
	},
};

export async function handleExecuteTool(req: Request, config: Config): Promise<Response> {
	let body: { name?: unknown; args?: unknown };
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const name = String(body.name ?? '');
	if (!name) return Response.json({ error: 'Missing tool name' }, { status: 400 });

	const handler = BACKEND_TOOL_HANDLERS[name];
	if (!handler) return Response.json({ error: `Unknown tool: ${name}` }, { status: 404 });

	const args = (body.args && typeof body.args === 'object' && !Array.isArray(body.args))
		? (body.args as Record<string, unknown>)
		: {};

	try {
		const result = await handler(args, config);
		return Response.json({ result });
	} catch (err) {
		return Response.json({ error: (err as Error).message }, { status: 500 });
	}
}
