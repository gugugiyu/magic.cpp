import { Config, CorsConfig } from "../config";

export function corsHeaders(config: CorsConfig) {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Allow-Credentials': config.allowCredentials ? 'true' : 'false',
		'Access-Control-Max-Age': config.maxAge.toString(),
	};
}

export function applyCorsHeaders(headers: Headers, origin: string | null, cors: CorsConfig) {
	if (cors.allowedOrigins.includes('*')) {
		headers.set('Access-Control-Allow-Origin', '*');
	} else if (origin && cors.allowedOrigins.includes(origin)) {
		headers.set('Access-Control-Allow-Origin', origin);
	}

	headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	headers.set('Access-Control-Allow-Credentials', cors.allowCredentials ? 'true' : 'false');
	headers.set('Access-Control-Max-Age', cors.maxAge.toString());
}
