import { fetchFileTree, type FileSystemNode } from '$lib/services/filesystem.service.js';
import { SvelteSet } from 'svelte/reactivity';

export class FilesystemStore {
	tree = $state<FileSystemNode[] | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	expanded = $state(new SvelteSet<string>());
	fileCount = $state(0);
	sidebarOpen = $state(false);
	searchQuery = $state('');

	filteredTree = $derived.by(() => {
		if (!this.tree) return null;
		if (!this.searchQuery.trim()) return this.tree;
		return this.filterTreeByQuery(this.tree, this.searchQuery.toLowerCase());
	});

	private filterTreeByQuery(nodes: FileSystemNode[], query: string): FileSystemNode[] {
		const result: FileSystemNode[] = [];
		for (const node of nodes) {
			const nameMatches = node.name.toLowerCase().includes(query);
			const pathMatches = node.path.toLowerCase().includes(query);
			if (nameMatches || pathMatches) {
				result.push({ ...node });
			} else if (node.children) {
				const filteredChildren = this.filterTreeByQuery(node.children, query);
				if (filteredChildren.length > 0) {
					result.push({ ...node, children: filteredChildren });
				}
			}
		}
		return result;
	}

	async load(path?: string) {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			const result = await fetchFileTree(path);
			if (!path) {
				this.tree = result.tree;
				this.fileCount = result.fileCount;
			} else if (this.tree) {
				this.findAndUpdateNode(this.tree, path, result.tree);
				this.expanded.add(path);
				this.fileCount = this.countFiles(this.tree);
			}
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to load file tree';
		} finally {
			this.loading = false;
		}
	}

	refresh() {
		this.tree = null;
		this.fileCount = 0;
		this.expanded = new SvelteSet<string>();
		return this.load();
	}

	toggle(path: string) {
		if (this.expanded.has(path)) {
			this.expanded.delete(path);
		} else {
			this.expanded.add(path);
		}
	}

	isExpanded(path: string): boolean {
		return this.expanded.has(path);
	}

	clearError() {
		this.error = null;
	}

	private findAndUpdateNode(
		nodes: FileSystemNode[],
		targetPath: string,
		children: FileSystemNode[]
	): boolean {
		for (const node of nodes) {
			if (node.path === targetPath) {
				node.children = children;
				return true;
			}
			if (node.children && this.findAndUpdateNode(node.children, targetPath, children)) {
				return true;
			}
		}
		return false;
	}

	private countFiles(nodes: FileSystemNode[]): number {
		let count = 0;
		for (const node of nodes) {
			if (node.type === 'file') count++;
			if (node.children) count += this.countFiles(node.children);
		}
		return count;
	}
}

export const filesystemStore = new FilesystemStore();
