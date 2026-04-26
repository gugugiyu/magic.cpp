import { AttachmentType, MessageRole } from '$lib/enums';
import type { DatabaseMessage } from '$lib/types';

export class MessageUtilsService {
	static getConversationModel(messages: DatabaseMessage[]): string | null {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message.role === MessageRole.ASSISTANT && message.model) return message.model;
		}
		return null;
	}

	static findPreviousCompactionSummary(allMessages: DatabaseMessage[]): string | null {
		const summaryMessage = [...allMessages]
			.reverse()
			.find((m) => m.extra?.some((e) => e.type === AttachmentType.COMPACTION_SUMMARY));
		return summaryMessage?.content ?? null;
	}

	static getDeletionInfo(
		allMessages: DatabaseMessage[],
		messageId: string,
		findMessageById: (msgs: DatabaseMessage[], id: string) => DatabaseMessage | undefined,
		findDescendantMessages: (msgs: DatabaseMessage[], id: string) => string[]
	): {
		totalCount: number;
		userMessages: number;
		assistantMessages: number;
		messageTypes: string[];
	} {
		const messageToDelete = findMessageById(allMessages, messageId);

		if (messageToDelete?.role === MessageRole.SYSTEM) {
			const messagesToDelete = allMessages.filter((m) => m.id === messageId);
			let userMessages = 0;
			let assistantMessages = 0;
			const messageTypes: string[] = [];

			for (const msg of messagesToDelete) {
				if (msg.role === MessageRole.USER) {
					userMessages++;
					if (!messageTypes.includes('user message')) messageTypes.push('user message');
				} else if (msg.role === MessageRole.ASSISTANT) {
					assistantMessages++;
					if (!messageTypes.includes('assistant response')) messageTypes.push('assistant response');
				}
			}

			return { totalCount: 1, userMessages, assistantMessages, messageTypes };
		}

		const descendants = findDescendantMessages(allMessages, messageId);
		const allToDelete = [messageId, ...descendants];
		const messagesToDelete = allMessages.filter((m) => allToDelete.includes(m.id));
		let userMessages = 0;
		let assistantMessages = 0;
		const messageTypes: string[] = [];

		for (const msg of messagesToDelete) {
			if (msg.role === MessageRole.USER) {
				userMessages++;
				if (!messageTypes.includes('user message')) messageTypes.push('user message');
			} else if (msg.role === MessageRole.ASSISTANT) {
				assistantMessages++;
				if (!messageTypes.includes('assistant response')) messageTypes.push('assistant response');
			}
		}

		return {
			totalCount: allToDelete.length,
			userMessages,
			assistantMessages,
			messageTypes
		};
	}
}
