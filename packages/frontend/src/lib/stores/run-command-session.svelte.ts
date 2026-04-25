/**
 * runCommandSessionStore - Session-level approval store for run_command tool.
 *
 * Maintains a set of commands approved for the current browser session.
 * Approved commands are persisted to localStorage so they survive page reloads
 * but can be revoked globally via a single button.
 *
 * Approval is checked by base command (first token), so approving "git" allows
 * "git status", "git log", etc.
 */

import { browser } from '$app/environment';
import { SESSION_COMMANDS_LOCALSTORAGE_KEY } from '$lib/constants';
import { serverEndpointStore } from '$lib/stores/server-endpoint.svelte';

class RunCommandSessionStore {
	#approved = $state<string[]>(this.loadFromStorage());
	/** Pending approval requests keyed by toolCallId. */
	#pending = $state<Map<string, { command: string; resolve: (approved: boolean) => void }>>(
		new Map()
	);
	/** Hard-coded allowed list from the backend config. */
	#backendAllowedList = $state<string[]>([]);
	/** Whether the backend allow-list is currently loading. */
	#backendAllowedListLoading = $state(false);
	/** Error from the last backend allow-list fetch, if any. */
	#backendAllowedListError = $state<string | null>(null);

	constructor() {
		if (browser) {
			this.loadBackendAllowedList();
		}
	}

	private async loadBackendAllowedList(): Promise<void> {
		this.#backendAllowedListLoading = true;
		this.#backendAllowedListError = null;
		try {
			const endpoint = serverEndpointStore.getBaseUrl();
			const resp = await fetch(`${endpoint}/api/tools/allowed-commands`);
			if (!resp.ok) {
				this.#backendAllowedListError = `HTTP ${resp.status}`;
				return;
			}
			const data = (await resp.json()) as { allowedList?: string[] };
			if (Array.isArray(data.allowedList)) {
				this.#backendAllowedList = data.allowedList;
			}
		} catch (err) {
			this.#backendAllowedListError = err instanceof Error ? err.message : String(err);
		} finally {
			this.#backendAllowedListLoading = false;
		}
	}

	private loadFromStorage(): string[] {
		if (!browser) return [];

		try {
			const stored = localStorage.getItem(SESSION_COMMANDS_LOCALSTORAGE_KEY);
			if (stored !== null) {
				const parsed = JSON.parse(stored) as string[];
				if (Array.isArray(parsed)) {
					return parsed;
				}
			}
		} catch (error) {
			console.warn('Failed to load session command approvals:', error);
		}

		return [];
	}

	private saveToStorage(): void {
		if (!browser) return;

		try {
			localStorage.setItem(SESSION_COMMANDS_LOCALSTORAGE_KEY, JSON.stringify(this.#approved));
		} catch (error) {
			console.warn('Failed to save session command approvals:', error);
		}
	}

	/**
	 * Check if a command is approved for this session.
	 * Checks both exact command and base command (first token).
	 * Also respects the backend hard-coded allowed list.
	 */
	isApproved(command: string): boolean {
		const trimmed = command.trim();
		const baseCommand = trimmed.split(/\s+/)[0];
		if (this.#approved.includes(trimmed) || this.#approved.includes(baseCommand)) return true;
		if (this.#backendAllowedList.includes('*')) return true;
		if (
			this.#backendAllowedList.includes(trimmed) ||
			this.#backendAllowedList.includes(baseCommand)
		)
			return true;
		return false;
	}

	/**
	 * Approve a command for this session.
	 * Approves the base command so variants are also allowed.
	 */
	approve(command: string): void {
		const baseCommand = command.trim().split(/\s+/)[0];
		if (!baseCommand) return;
		if (this.#approved.includes(baseCommand)) return;
		this.#approved = [...this.#approved, baseCommand];
		this.saveToStorage();
	}

	/**
	 * Revoke approval for a specific command.
	 */
	revoke(command: string): void {
		const baseCommand = command.trim().split(/\s+/)[0];
		this.#approved = this.#approved.filter((c) => c !== baseCommand);
		this.saveToStorage();
	}

	/**
	 * Revoke ALL session command approvals.
	 */
	revokeAll(): void {
		this.#approved = [];
		this.saveToStorage();
	}

	/**
	 * Request user approval for a specific tool call.
	 * Returns a Promise that resolves when the user approves or denies.
	 * Rejects if the signal aborts or after a 5-minute timeout to prevent indefinite hangs.
	 */
	requestApproval(toolCallId: string, command: string, signal?: AbortSignal): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener('abort', onAbort, { once: true });

			const timeout = setTimeout(() => {
				reject(new Error('Approval timed out after 5 minutes'));
			}, 300_000);

			const wrappedResolve = (approved: boolean) => {
				clearTimeout(timeout);
				signal?.removeEventListener('abort', onAbort);
				resolve(approved);
			};

			this.#pending.set(toolCallId, { command, resolve: wrappedResolve });
			this.#pending = new Map(this.#pending);
		});
	}

	/**
	 * Resolve a pending approval request.
	 * @param toolCallId - The tool call ID to resolve
	 * @param approved - Whether the user approved the command
	 */
	resolveApproval(toolCallId: string, approved: boolean): void {
		const entry = this.#pending.get(toolCallId);
		if (!entry) return;
		entry.resolve(approved);
		this.#pending.delete(toolCallId);
		this.#pending = new Map(this.#pending);
	}

	/**
	 * Reject all pending approvals (e.g. on conversation abort or component unmount).
	 */
	clearPending(): void {
		for (const [, entry] of this.#pending) {
			entry.resolve(false);
		}
		this.#pending = new Map();
	}

	/**
	 * Check if a specific tool call is awaiting user approval.
	 */
	isPending(toolCallId: string): boolean {
		return this.#pending.has(toolCallId);
	}

	/**
	 * Get the pending command for a tool call ID, if any.
	 */
	getPendingCommand(toolCallId: string): string | undefined {
		return this.#pending.get(toolCallId)?.command;
	}

	/**
	 * Get a copy of the currently approved commands.
	 */
	getApprovedCommands(): string[] {
		return [...this.#approved];
	}

	/**
	 * Number of approved commands.
	 */
	get count(): number {
		return this.#approved.length;
	}

	/**
	 * The hard-coded allowed list from the backend config.
	 */
	get backendAllowedList(): string[] {
		return [...this.#backendAllowedList];
	}

	/**
	 * Whether the backend allow-list is currently loading.
	 */
	get backendAllowedListLoading(): boolean {
		return this.#backendAllowedListLoading;
	}

	/**
	 * Error from the last backend allow-list fetch, if any.
	 */
	get backendAllowedListError(): string | null {
		return this.#backendAllowedListError;
	}

	/**
	 * Refresh the backend allow-list.
	 */
	refreshBackendAllowedList(): void {
		if (browser) {
			this.loadBackendAllowedList();
		}
	}
}

export const runCommandSessionStore = new RunCommandSessionStore();

export const approvedCommands = () => runCommandSessionStore.getApprovedCommands();
export const approvedCommandCount = () => runCommandSessionStore.count;
