import { Config } from "../config";

export function corsHeaders(config: Config) {
	return {
		'Access-Control-Allow-Origin': config.debug ? '*' : 'http://localhost:5173',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};
}

export function applyCorsHeaders(headers: Headers) {
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}