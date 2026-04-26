import {
	IMAGE_MIME_TO_EXTENSION,
	DATA_URI_BASE64_REGEX,
	MCP_ATTACHMENT_NAME_PREFIX,
	DEFAULT_IMAGE_EXTENSION,
	NEWLINE_SEPARATOR
} from '$lib/constants';
import { AttachmentType, MimeTypePrefix } from '$lib/enums';
import type { DatabaseMessageExtra } from '$lib/types';

export class AgenticAttachmentService {
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

	static buildAttachmentName(mimeType: string, index: number): string {
		const extension = IMAGE_MIME_TO_EXTENSION[mimeType] ?? DEFAULT_IMAGE_EXTENSION;
		return `${MCP_ATTACHMENT_NAME_PREFIX}-${Date.now()}-${index}.${extension}`;
	}
}
