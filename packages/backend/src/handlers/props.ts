import type { ModelPool } from '../pool/model-pool.ts';
import { proxyRequest } from '../utils/proxy.ts';

/**
 * Synthetic /props response for OpenAI-type upstreams (no native /props endpoint).
 * Shape mirrors ApiLlamaCppServerProps with sensible defaults.
 * Role is always 'model' so the frontend enters MODEL mode for these upstreams.
 */
const SYNTHETIC_PROPS = {
	role: 'model',
	total_slots: 1,
	model_path: '',
	chat_template: '',
	bos_token: '',
	eos_token: '',
	build_info: 'openai-compat',
	modalities: { vision: false, audio: false },
	default_generation_settings: {
		id: 0,
		id_task: 0,
		n_ctx: 4096,
		speculative: false,
		is_processing: false,
		params: {
			n_predict: 4096,
			seed: -1,
			temperature: 0.7,
			dynatemp_range: 0,
			dynatemp_exponent: 1,
			top_k: 40,
			top_p: 0.9,
			min_p: 0.05,
			top_n_sigma: -1,
			xtc_probability: 0,
			xtc_threshold: 0.1,
			typ_p: 1,
			repeat_last_n: 64,
			repeat_penalty: 1.1,
			presence_penalty: 0,
			frequency_penalty: 0,
			dry_multiplier: 0,
			dry_base: 1.75,
			dry_allowed_length: 2,
			dry_penalty_last_n: -1,
			dry_sequence_breakers: ['\n', ':', '"', '*'],
			mirostat: 0,
			mirostat_tau: 5,
			mirostat_eta: 0.1,
			stop: [],
			max_tokens: -1,
			n_keep: 0,
			n_discard: 0,
			ignore_eos: false,
			stream: true,
			logit_bias: [],
			n_probs: 0,
			min_keep: 0,
			grammar: '',
			grammar_lazy: false,
			grammar_triggers: [],
			preserved_tokens: [],
			chat_format: 'Content-only',
			reasoning_format: 'none',
			reasoning_in_content: false,
			generation_prompt: '',
			samplers: ['top_k', 'typ_p', 'top_p', 'min_p', 'xtc', 'temperature'],
			backend_sampling: false,
			'speculative.n_max': 16,
			'speculative.n_min': 5,
			'speculative.p_min': 0.9,
			timings_per_token: false,
			post_sampling_probs: false,
			lora: [],
		},
		prompt: '',
		next_token: {
			has_next_token: false,
			has_new_line: false,
			n_remain: 0,
			n_decoded: 0,
			stopping_word: '',
		},
	},
};

/**
 * GET /props[?model=] — proxy to owning upstream for llamacpp, synthesize for openai.
 */
export async function handleProps(req: Request, pool: ModelPool): Promise<Response> {
	const url = new URL(req.url);
	const modelId = url.searchParams.get('model') ?? undefined;

	if (modelId) {
		const upstream = pool.resolveUpstream(modelId);
		if (!upstream) {
			return Response.json({ error: `model '${modelId}' not found` }, { status: 404 });
		}
		if (upstream.type === 'openai') {
			return Response.json(SYNTHETIC_PROPS);
		}
		// Don't proxy to disabled upstreams
		if (upstream.enabled === false) {
			return Response.json({ error: `upstream '${upstream.id}' is disabled` }, { status: 503 });
		}
		const resp = await proxyRequest(req, upstream, '/props');
		if (!resp.ok) {
			console.warn(`[props] upstream ${upstream.id} returned ${resp.status} for /props — falling back to synthetic props`);
			return Response.json(SYNTHETIC_PROPS);
		}
		return resp;
	}

	// No model specified — use first ENABLED llamacpp upstream, or synthesize if all are openai or disabled
	const llamacpp = pool.getAllUpstreams().find((u) => u.type === 'llamacpp' && u.enabled !== false);
	if (llamacpp) {
		const resp = await proxyRequest(req, llamacpp, '/props');
		if (!resp.ok) {
			console.warn(`[props] upstream ${llamacpp.id} returned ${resp.status} for /props — falling back to synthetic props`);
			return Response.json(SYNTHETIC_PROPS);
		}
		return resp;
	}

	// All upstreams are openai-type
	return Response.json(SYNTHETIC_PROPS);
}
