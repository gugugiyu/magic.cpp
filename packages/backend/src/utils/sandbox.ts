import { resolve, normalize, join, relative, basename, dirname } from 'path';
import { realpath, mkdir } from 'node:fs/promises';

const BINARY_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tiff',
	'.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
	'.exe', '.dll', '.so', '.dylib',
	'.mp3', '.mp4', '.wav', '.ogg', '.flac',
	'.woff', '.woff2', '.ttf', '.otf',
	'.db', '.sqlite', '.sqlite3',
]);

function isBinaryByMagic(buffer: Uint8Array): boolean {
	if (buffer.length < 4) return false;
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
	if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
	if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
	if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return true;
	if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;
	if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) return true;
	if ((buffer[0] === 0xCF && buffer[1] === 0xFA) || (buffer[0] === 0xCA && buffer[1] === 0xFE)) return true;
	if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
	return false;
}

export async function hasBinaryBytes(filePath: string): Promise<boolean> {
	try {
		const file = Bun.file(filePath);
		const buffer = await file.arrayBuffer();
		const view = new Uint8Array(buffer);
		const limit = Math.min(view.length, 8192);
		for (let i = 0; i < limit; i++) {
			if (view[i] === 0) return true;
		}
		if (view.length >= 4 && isBinaryByMagic(view)) return true;
		return false;
	} catch {
		return false;
	}
}

export async function sandboxPath(rawPath: string, rootPath: string): Promise<string> {
	const normalized = normalize(rawPath.replace(/\\/g, '/'));
	if (normalized.includes('..')) throw new Error('Path traversal is not allowed');
	if (normalized.includes('\0')) throw new Error('Null bytes are not allowed in paths');
	const full = resolve(rootPath, normalized);

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

	const rel = relative(rootPath, real);
	if (rel.startsWith('..') || resolve(rel) === resolve(rootPath, '..')) {
		throw new Error('Path escapes sandbox root');
	}
	return real;
}

export function isBinaryExtension(filePath: string): boolean {
	const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
	return BINARY_EXTENSIONS.has(ext);
}

export async function ensureParentDir(filePath: string): Promise<void> {
	const parent = dirname(filePath);
	await mkdir(parent, { recursive: true });
}
