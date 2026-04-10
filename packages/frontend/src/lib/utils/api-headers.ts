/**
 * Get standard JSON headers
 * Note: API key is handled centrally by the backend
 */
export function getJsonHeaders(): Record<string, string> {
	return {
		'Content-Type': 'application/json'
	};
}
