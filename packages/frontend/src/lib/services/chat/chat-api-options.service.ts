import type { SettingsConfigType } from '$lib/types';

interface ApiOptionsInput {
	config: SettingsConfigType;
	modelName: string | null;
}

export class ChatApiOptionsService {
	static buildApiOptions(input: ApiOptionsInput): Record<string, unknown> {
		const { config, modelName } = input;
		const hasValue = (value: unknown): boolean =>
			value !== undefined && value !== null && value !== '';

		const apiOptions: Record<string, unknown> = {
			stream: true,
			timings_per_token: true
		};

		if (modelName) apiOptions.model = modelName;
		if (config.systemMessage) apiOptions.systemMessage = config.systemMessage;
		if (config.disableReasoningParsing) apiOptions.disableReasoningParsing = true;
		if (config.excludeReasoningFromContext) apiOptions.excludeReasoningFromContext = true;

		const numericKeys = [
			'temperature',
			'max_tokens',
			'dynatemp_range',
			'dynatemp_exponent',
			'top_k',
			'top_p',
			'min_p',
			'xtc_probability',
			'xtc_threshold',
			'typ_p',
			'repeat_last_n',
			'repeat_penalty',
			'presence_penalty',
			'frequency_penalty',
			'dry_multiplier',
			'dry_base',
			'dry_allowed_length',
			'dry_penalty_last_n'
		] as const;

		for (const key of numericKeys) {
			const value = config[key];
			if (hasValue(value)) {
				apiOptions[key] = Number(value);
			}
		}

		if (config.samplers) apiOptions.samplers = config.samplers;
		if (config.backend_sampling) apiOptions.backend_sampling = config.backend_sampling;
		if (config.custom) apiOptions.custom = config.custom;

		return apiOptions;
	}
}
