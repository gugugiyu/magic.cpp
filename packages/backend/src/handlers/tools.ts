import { resolve, normalize, join, relative, basename, dirname } from 'path';
import { readdir, stat, rename, mkdir, realpath } from 'node:fs/promises';
import type { Config } from '../config.ts';

interface BackendToolResult {
	result: string;
	truncated?: boolean;
	originalLength?: number;
}

type BackendToolHandler = (
	args: Record<string, unknown>,
	config: Config,
	signal?: AbortSignal
) => Promise<BackendToolResult>;

const BINARY_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tiff',
	'.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
	'.exe', '.dll', '.so', '.dylib',
	'.mp3', '.mp4', '.wav', '.ogg', '.flac',
	'.woff', '.woff2', '.ttf', '.otf',
	'.db', '.sqlite', '.sqlite3',
]);

/** Magic-number based binary detection for extensionless files. */
function isBinaryByMagic(buffer: Uint8Array): boolean {
	if (buffer.length < 4) return false;
	// PNG
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
	// JPEG
	if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
	// GIF
	if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
	// PDF
	if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return true;
	// ZIP / Office docs
	if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
	// ELF
	if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) return true;
	// Mach-O (32/64/bitcode)
	if ((buffer[0] === 0xCF && buffer[1] === 0xFA) || (buffer[0] === 0xCA && buffer[1] === 0xFE)) return true;
	// WebP (RIFF....WEBP)
	if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
	return false;
}

async function hasBinaryBytes(filePath: string): Promise<boolean> {
	try {
		const file = Bun.file(filePath);
		const buffer = await file.arrayBuffer();
		const view = new Uint8Array(buffer);
		// Check null bytes in first 8KB
		const limit = Math.min(view.length, 8192);
		for (let i = 0; i < limit; i++) {
			if (view[i] === 0) return true;
		}
		// Magic-number check for extensionless binaries
		if (view.length >= 4 && isBinaryByMagic(view)) return true;
		return false;
	} catch {
		return false;
	}
}

function parseCommand(command: string): string[] {
	const args: string[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';

	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		if (!inQuotes && (char === '"' || char === "'")) {
			inQuotes = true;
			quoteChar = char;
		} else if (inQuotes && char === quoteChar) {
			inQuotes = false;
			quoteChar = '';
		} else if (!inQuotes && /\s/.test(char)) {
			if (current) {
				args.push(current);
				current = '';
			}
		} else {
			current += char;
		}
	}
	if (current || args.length === 0) {
		args.push(current);
	}
	return args;
}

const SHELL_METACHARACTERS = /[;|&$()`<>]/;

const COMMAND_GUARDS: Record<string, { allowAll?: boolean; allowedSubcommands?: string[] }> = {
	git: { allowedSubcommands: ['status', 'log', 'diff', 'branch', 'ls-files', 'show'] },
};

function validateCommandArgs(argv: string[]): boolean {
	if (argv.some(arg => SHELL_METACHARACTERS.test(arg))) return false;
	const base = argv[0];
	const guard = COMMAND_GUARDS[base];
	if (!guard) return true; // No guard = any args allowed (base command already whitelisted)
	if (guard.allowAll) return true;
	if (guard.allowedSubcommands && argv.length > 1) {
		return guard.allowedSubcommands.includes(argv[1]);
	}
	return true;
}

function isCommandAllowed(
	command: string,
	allowedList: string[]
): { allowed: boolean; baseCommand: string; argv: string[] } {
	const trimmed = command.trim();
	const argv = parseCommand(trimmed);
	const baseCommand = argv[0] || '';

	if (allowedList.includes('*')) return { allowed: true, baseCommand, argv };
	if (allowedList.includes(trimmed)) return { allowed: true, baseCommand, argv };
	if (allowedList.includes(baseCommand)) {
		if (!validateCommandArgs(argv)) {
			return { allowed: false, baseCommand, argv };
		}
		return { allowed: true, baseCommand, argv };
	}

	return { allowed: false, baseCommand, argv };
}

async function sandboxPath(rawPath: string, rootPath: string): Promise<string> {
	const normalized = normalize(rawPath.replace(/\\/g, '/'));
	if (normalized.includes('..')) throw new Error('Path traversal is not allowed');
	if (normalized.includes('\0')) throw new Error('Null bytes are not allowed in paths');
	const full = resolve(rootPath, normalized);

	// Resolve symlinks. If the path doesn't exist yet, resolve its parent directory.
	let real: string;
	try {
		real = await realpath(full);
	} catch {
		const parent = dirname(full);
		try {
			const realParent = await realpath(parent);
			real = join(realParent, basename(full));
		} catch {
			real = full;
		}
	}

	// Ensure the resolved path is still inside rootPath
	const rel = relative(rootPath, real);
	if (rel.startsWith('..') || resolve(rel) === resolve(rootPath, '..')) {
		throw new Error('Path escapes sandbox root');
	}
	return real;
}

function isBinaryExtension(filePath: string): boolean {
	const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
	return BINARY_EXTENSIONS.has(ext);
}

async function ensureParentDir(filePath: string): Promise<void> {
	const parent = dirname(filePath);
	await mkdir(parent, { recursive: true });
}

function requireAdminKey(req: Request, config: Config): Response | null {
	const adminKey = config.commands.adminKey;
	if (!adminKey) return null;
	const auth = req.headers.get('Authorization') || '';
	const match = auth.match(/^Bearer\s+(.+)$/);
	if (!match || match[1] !== adminKey) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	return null;
}

const BACKEND_TOOL_HANDLERS: Record<string, BackendToolHandler> = {
	async read_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return { result: 'Error: path is required' };
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);
		if (isBinaryExtension(full)) return { result: `Error: refusing to read binary file: ${path}` };
		const file = Bun.file(full);
		if (!(await file.exists())) return { result: `Error: file not found: ${path}` };
		if (await hasBinaryBytes(full)) return { result: `Error: file appears to be binary: ${path}` };
		const content = await file.text();
		const startLine = args.start_line != null ? Number(args.start_line) : undefined;
		const endLine = args.end_line != null ? Number(args.end_line) : undefined;
		if (startLine !== undefined || endLine !== undefined) {
			const lines = content.split('\n');
			const start = Math.max(1, startLine ?? 1);
			const end = Math.min(lines.length, endLine ?? lines.length);
			return { result: lines.slice(start - 1, end).join('\n') };
		}
		return { result: content };
	},

	async write_file(args, config) {
		const path = String(args.path ?? '');
		const content = String(args.content ?? '');
		if (!path) return { result: 'Error: path is required' };
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);
		await ensureParentDir(full);
		await Bun.write(full, content);
		return { result: `Written ${content.length} chars to ${path}` };
	},

	async patch_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return { result: 'Error: path is required' };
		const startLine = Number(args.start_line ?? 0);
		const endLine = Number(args.end_line ?? 0);
		const replacement = String(args.replacement ?? '');
		if (!startLine || !endLine) return { result: 'Error: start_line and end_line are required' };
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);
		const file = Bun.file(full);
		if (!(await file.exists())) return { result: `Error: file not found: ${path}` };
		if (await hasBinaryBytes(full)) return { result: `Error: file appears to be binary: ${path}` };
		const existing = await file.text();
		const lines = existing.split('\n');
		const before = lines.slice(0, startLine - 1);
		const after = lines.slice(endLine);
		const replacementLines = replacement === '' ? [] : replacement.split('\n');
		const patched = [...before, ...replacementLines, ...after].join('\n');
		await Bun.write(full, patched);
		return {
			result: `Patched ${path}: replaced lines ${startLine}-${endLine} with ${replacementLines.length} line(s)`
		};
	},

	async list_directory(args, config) {
		const path = String(args.path ?? '.');
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);
		let entries: string[];
		try {
			entries = await readdir(full);
		} catch {
			return { result: `Error: directory not found or not accessible: ${path}` };
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
		return { result: lines.length > 0 ? lines.join('\n') : '(empty directory)' };
	},

	async search_files(args, config) {
		const path = String(args.path ?? '.');
		const query = String(args.query ?? '');
		if (!query) return { result: 'Error: query is required' };
		const useRegex = Boolean(args.regex ?? false);
		const caseSensitive = Boolean(args.case_sensitive ?? false);
		const maxResults = Math.min(Number(args.max_results ?? 50), 200);
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);

		let pattern: RegExp;
		try {
			const escaped = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
		} catch {
			return { result: `Error: invalid regex pattern: ${query}` };
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
					if (await hasBinaryBytes(entryPath)) continue;
					const file = Bun.file(entryPath);
					let content: string;
					try {
						content = await file.text();
					} catch {
						continue;
					}
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
		if (!s) return { result: `Error: path not found: ${path}` };
		if (s.isDirectory()) {
			await walkDir(full);
		} else {
			if (await hasBinaryBytes(full)) return { result: `Error: file appears to be binary: ${path}` };
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

		return { result: results.length > 0 ? results.join('\n') : 'No matches found.' };
	},

	async delete_file(args, config) {
		const path = String(args.path ?? '');
		if (!path) return { result: 'Error: path is required' };
		const full = await sandboxPath(path, config.resolvedFilesystemRootPath);
		const file = Bun.file(full);
		if (!(await file.exists())) return { result: `Error: file not found: ${path}` };
		await file.delete();
		return { result: `Deleted ${path}` };
	},

	async move_file(args, config) {
		const srcPath = String(args.source ?? '');
		const destPath = String(args.destination ?? '');
		if (!srcPath || !destPath) return { result: 'Error: source and destination are required' };
		const srcFull = await sandboxPath(srcPath, config.resolvedFilesystemRootPath);
		const destFull = await sandboxPath(destPath, config.resolvedFilesystemRootPath);
		const file = Bun.file(srcFull);
		if (!(await file.exists())) return { result: `Error: source not found: ${srcPath}` };
		await ensureParentDir(destFull);
		await rename(srcFull, destFull);
		return { result: `Moved ${srcPath} → ${destPath}` };
	},

	async run_command(args, config, signal) {
		const command = String(args.command ?? '');
		const rationale = String(args.rationale ?? '');
		const inShell = Boolean(args.inShell ?? false);

		if (!command) return { result: 'Error: command is required' };
		if (!rationale || rationale.trim().length < 10) {
			return { result: 'Error: rationale is required and must be at least 10 characters' };
		}

		const { allowed, baseCommand, argv } = isCommandAllowed(command, config.commands.allowedList);
		if (!allowed) {
			return { result: `Error: command "${baseCommand}" is not in the allowed list or uses disallowed arguments` };
		}

		if (inShell) {
			if (!config.commands.allowedList.includes('*')) {
				return {
					result: 'Error: shell execution requires wildcard permission ("*") in allowedList'
				};
			}
			if (!config.commands.shellEnabled) {
				return { result: 'Error: shell execution is disabled in server configuration' };
			}
		}

		try {
			const timeoutMs = 30000;
			const proc = Bun.spawn({
				cmd: inShell ? ['sh', '-c', command] : argv,
				cwd: config.resolvedFilesystemRootPath,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const abortPromise = new Promise<never>((_, reject) => {
				if (signal?.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}
				signal?.addEventListener(
					'abort',
					() => {
						proc.kill();
						reject(new DOMException('Aborted', 'AbortError'));
					},
					{ once: true }
				);
			});

			const timeout = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs);
			});

			await Promise.race([proc.exited, abortPromise, timeout]);

			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();
			const exitCode = proc.exitCode;

			let output = '';
			if (stdout) output += stdout;
			if (stderr) output += (output ? '\n' : '') + stderr;
			if (exitCode !== 0) {
				output += (output ? '\n' : '') + `[exit code: ${exitCode}]`;
			}

			const MAX_LEN = 10000;
			const originalLength = output.length;
			if (output.length > MAX_LEN) {
				output = output.slice(0, MAX_LEN) + `\n... (${output.length - MAX_LEN} chars trimmed) ...`;
			}

			return {
				result: output || '(no output)',
				...(originalLength > MAX_LEN && {
					truncated: true,
					originalLength
				})
			};
		} catch (err) {
			return { result: `Error: ${(err as Error).message}` };
		}
	},
};

export async function handleGetAllowedCommands(req: Request, config: Config): Promise<Response> {
	const authError = requireAdminKey(req, config);
	if (authError) return authError;
	return Response.json({ allowedList: config.commands.allowedList });
}

export async function handleExecuteTool(req: Request, config: Config): Promise<Response> {
	const authError = requireAdminKey(req, config);
	if (authError) return authError;

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
		const result = await handler(args, config, req.signal);
		return Response.json(result);
	} catch (err) {
		return Response.json({ error: (err as Error).message }, { status: 500 });
	}
}
