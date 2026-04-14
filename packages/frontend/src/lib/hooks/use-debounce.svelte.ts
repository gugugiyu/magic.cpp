/**
 * Debounce hook for Svelte 5 rune state.
 *
 * Usage:
 *   let query = $state('');
 *   const debouncedQuery = useDebounce(() => query, 200);
 *   // Access via: debouncedQuery.current
 *
 * The debounced value updates `delay` ms after the source stops changing.
 * Returns an object with a reactive `current` getter to preserve Svelte 5
 * reactivity across function boundaries (primitives lose reactivity if
 * returned directly from a function).
 */

export function useDebounce<T>(getSource: () => T, delay: number) {
	let value = $state(getSource()) as T;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const current = getSource();

		if (timeout) clearTimeout(timeout);

		timeout = setTimeout(() => {
			value = current;
		}, delay);

		return () => {
			if (timeout) clearTimeout(timeout);
		};
	});

	return {
		get current(): T {
			return value;
		}
	};
}
