export interface FileSystemNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	size?: number;
	children?: FileSystemNode[];
}

export interface FileSystemTreeResponse {
	tree: FileSystemNode[];
	fileCount: number;
}

export interface FileDiffResponse {
	insertions: number;
	deletions: number;
}

export async function fetchFileTree(path?: string): Promise<FileSystemTreeResponse> {
	const url = new URL(
		'/api/file-system',
		typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
	);
	if (path) url.searchParams.set('path', path);
	const res = await fetch(url.toString());
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Failed to fetch file tree: ${error}`);
	}
	return res.json();
}

export async function diffFile(path: string, content: string): Promise<FileDiffResponse> {
	const res = await fetch('/api/file-system/diff', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ path, content })
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Failed to diff file: ${error}`);
	}
	return res.json();
}

export async function readFileContent(path: string): Promise<string> {
	const res = await fetch('/api/tools/execute', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: 'read_file',
			args: { path }
		})
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Failed to read file: ${error}`);
	}
	const result = await res.json();
	if (result.result && result.result.startsWith('Error:')) {
		throw new Error(result.result);
	}
	return result.result;
}

export async function listDirectoryContent(path: string): Promise<string> {
	const res = await fetch('/api/tools/execute', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: 'list_directory',
			args: { path }
		})
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Failed to list directory: ${error}`);
	}
	const result = await res.json();
	if (result.result && result.result.startsWith('Error:')) {
		throw new Error(result.result);
	}
	return result.result;
}
