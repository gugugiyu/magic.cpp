/**
 * Safely converts a value to a number, returning a fallback if the result
 * is NaN or non-finite.
 *
 * Unlike `Number(value) ?? fallback` (which never triggers because `Number`
 * never returns `null/undefined`), this properly guards against `NaN`.
 */
export function safeNumber(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}
