import type { ApiModelDataEntry, ApiModelDetails } from '$lib/types/api';

export interface ModelModalities {
	vision: boolean;
	audio: boolean;
}

export interface ModelOption {
	id: string;
	name: string;
	model: string;
	description?: string;
	capabilities: string[];
	modalities?: ModelModalities;
	details?: ApiModelDetails['details'];
	meta?: ApiModelDataEntry['meta'];
	parsedId?: ParsedModelId;
	aliases?: string[];
	tags?: string[];
	/** Upstream pool id that serves this model (backend-specific extension) */
	upstreamId?: string;
	/** Human-readable label of the owning upstream (backend-specific extension) */
	upstreamLabel?: string;
}

export interface ParsedModelId {
	raw: string;
	orgName: string | null;
	modelName: string | null;
	params: string | null;
	activatedParams: string | null;
	quantization: string | null;
	tags: string[];
}

/**
 * Modality capabilities for file validation
 */
export interface ModalityCapabilities {
	hasVision: boolean;
	hasAudio: boolean;
}
