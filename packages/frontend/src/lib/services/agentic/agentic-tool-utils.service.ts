import { SvelteSet } from 'svelte/reactivity';
import { repairJsonObject, sanitizeToolName } from '$lib/utils';
import {
	NEWLINE_SEPARATOR,
	DATA_URI_BASE64_REGEX,
	MCP_ATTACHMENT_NAME_PREFIX,
	DEFAULT_IMAGE_EXTENSION,
	IMAGE_MIME_TO_EXTENSION
} from '$lib/constants';
import { AttachmentType, ContentPartType, MimeTypePrefix, ToolCallType } from '$lib/enums';
import type { AgenticToolCallList } from '$lib/types/agentic';
import type { ApiChatCompletionToolCall } from '$lib/types/api';
import type { DatabaseMessageExtra, DatabaseMessageExtraImageFile } from '$lib/types/database';

export class AgenticToolUtils {
	static normalizeToolCalls(toolCalls: ApiChatCompletionToolCall[]): AgenticToolCallList {
		if (!toolCalls) return [];
		return toolCalls
			.map((call, index) => ({
				id: call?.id ?? `tool_${index}`,
				type: (call?.type as ToolCallType.FUNCTION) ?? ToolCallType.FUNCTION,
				function: {
					name: sanitizeToolName(call?.function?.name ?? ''),
					arguments: this.sanitizeToolArguments(call?.function?.arguments ?? '')
				}
			}))
			.filter((call) => call.function.name.trim() !== '');
	}

	static deduplicateToolCalls(calls: AgenticToolCallList): AgenticToolCallList {
		const seen = new SvelteSet<string>();
		const unique: AgenticToolCallList = [];
		for (const call of calls) {
			const key = `${call.function.name}:${call.function.arguments}`;
			if (!seen.has(key)) {
				seen.add(key);
				unique.push(call);
			}
		}
		return unique;
	}

	static sanitizeToolArguments(args: string): string {
		return repairJsonObject(args);
	}

	static extractBase64Attachments(result: string): {
		cleanedResult: string;
		attachments: DatabaseMessageExtra[];
	} {
		if (!result.trim()) {
			return { cleanedResult: result, attachments: [] };
		}

		const lines = result.split(NEWLINE_SEPARATOR);
		const attachments: DatabaseMessageExtra[] = [];
		let attachmentIndex = 0;

		const cleanedLines = lines.map((line) => {
			const trimmedLine = line.trim();
			const match = trimmedLine.match(DATA_URI_BASE64_REGEX);
			if (!match) {
				return line;
			}

			const mimeType = match[1].toLowerCase();
			const base64Data = match[2];

			if (!base64Data) {
				return line;
			}

			attachmentIndex += 1;
			const name = this.buildAttachmentName(mimeType, attachmentIndex);

			if (mimeType.startsWith(MimeTypePrefix.IMAGE)) {
				attachments.push({
					type: AttachmentType.IMAGE,
					name,
					base64Url: trimmedLine
				});

				return `[Attachment saved: ${name}]`;
			}

			return line;
		});

		return { cleanedResult: cleanedLines.join(NEWLINE_SEPARATOR), attachments };
	}

	private static buildAttachmentName(mimeType: string, index: number): string {
		const extension = IMAGE_MIME_TO_EXTENSION[mimeType] ?? DEFAULT_IMAGE_EXTENSION;
		return `${MCP_ATTACHMENT_NAME_PREFIX}-${Date.now()}-${index}.${extension}`;
	}

	static buildContentParts(
		cleanedResult: string,
		attachments: DatabaseMessageExtra[],
		effectiveModel: string,
		modelSupportsVision: (model: string) => boolean
	): string | import('$lib/types/api').ApiChatMessageContentPart[] {
		const contentParts: import('$lib/types/api').ApiChatMessageContentPart[] = [
			{ type: ContentPartType.TEXT, text: cleanedResult }
		];

		for (const attachment of attachments) {
			if (attachment.type === AttachmentType.IMAGE) {
				if (modelSupportsVision(effectiveModel)) {
					contentParts.push({
						type: ContentPartType.IMAGE_URL,
						image_url: {
							url: (attachment as DatabaseMessageExtraImageFile).base64Url
						}
					});
				}
			}
		}

		return contentParts.length === 1 ? cleanedResult : contentParts;
	}
}
