import { repairJsonObject } from '$lib/utils';

export class McpToolParserService {
	static parseToolArguments(args: string | Record<string, unknown>): Record<string, unknown> {
		if (typeof args === 'string') {
			const trimmed = args.trim();
			if (trimmed === '') {
				return {};
			}

			const repaired = repairJsonObject(trimmed);
			try {
				const parsed = JSON.parse(repaired);
				if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
					throw new Error(
						`Tool arguments must be an object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`
					);

				return parsed as Record<string, unknown>;
			} catch (error) {
				throw new Error(`Failed to parse tool arguments as JSON: ${(error as Error).message}`);
			}
		}

		if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
			return args;
		}

		throw new Error(`Invalid tool arguments type: ${typeof args}`);
	}
}
