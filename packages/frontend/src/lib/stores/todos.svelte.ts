import { SvelteMap } from 'svelte/reactivity';
import { DatabaseService } from '$lib/services/database.service';
import { conversationsStore } from '$lib/stores/conversations.svelte';
import type { TodoItem } from '@shared/types';

class TodoStore {
	/** Per-conversation todo lists, keyed by conversation ID */
	conversationTodos = new SvelteMap<string, TodoItem[]>();

	/** Track which conversations have loaded todos from DB */
	loadedConversations = new SvelteMap<string, boolean>();

	getTodos(convId: string): TodoItem[] {
		return this.conversationTodos.get(convId) ?? [];
	}

	async loadTodos(convId: string): Promise<void> {
		if (this.loadedConversations.has(convId)) return;

		const conversationExists = conversationsStore.conversations.some((c) => c.id === convId);
		if (!conversationExists) {
			return;
		}

		try {
			const conv = await DatabaseService.getConversation(convId);
			if (conv?.todos) {
				this.conversationTodos.set(convId, conv.todos);
			}
			this.loadedConversations.set(convId, true);
		} catch (e) {
			console.error('Failed to load todos:', e);
		}
	}

	async setTodos(convId: string, todos: TodoItem[]): Promise<void> {
		this.conversationTodos.set(convId, todos);
		try {
			await DatabaseService.updateConversation(convId, { todos });
		} catch (e) {
			console.error('Failed to persist todos:', e);
		}
	}

	async clearTodos(convId: string): Promise<void> {
		this.conversationTodos.delete(convId);
		this.loadedConversations.delete(convId);
		try {
			await DatabaseService.updateConversation(convId, { todos: [] });
		} catch (e) {
			console.error('Failed to clear todos:', e);
		}
	}

	/** Bulk create / recreate todo list for a conversation */
	async createTodos(convId: string, texts: string[], _isRecreated: boolean): Promise<TodoItem[]> {
		await this.loadTodos(convId);
		const items: TodoItem[] = texts.map((text) => ({ text, done: false }));
		await this.setTodos(convId, items);
		return items;
	}

	/** Mark todo items as done by their 0-based indices */
	async markTodos(convId: string, indices: number[]): Promise<TodoItem[]> {
		await this.loadTodos(convId);
		const current = this.getTodos(convId);
		const updated = current.map((item, i) =>
			indices.includes(i) ? { ...item, done: true } : item
		);
		await this.setTodos(convId, updated);
		return updated;
	}

	/** Edit a todo item's text by its 0-based index (user-only) */
	async editTodo(convId: string, index: number, text: string): Promise<TodoItem[]> {
		await this.loadTodos(convId);
		const current = this.getTodos(convId);
		if (index < 0 || index >= current.length) return current;
		const updated = current.map((item, i) => (i === index ? { ...item, text } : item));
		await this.setTodos(convId, updated);
		return updated;
	}

	/** Format todos as a numbered markdown list for tool return content */
	formatMarkdownList(todos: TodoItem[]): string {
		if (todos.length === 0) return 'No todos.';
		return todos.map((item, i) => `${i + 1}. ${item.done ? '[x]' : '[ ]'} ${item.text}`).join('\n');
	}
}

export const todoStore = new TodoStore();
