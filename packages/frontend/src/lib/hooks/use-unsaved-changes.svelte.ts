/**
 * Hook to track unsaved changes between a local draft and persisted config.
 *
 * Usage:
 *   let localConfig = $state({ ...config() });
 *   const unsaved = useUnsavedChanges(() => localConfig, () => config());
 *   // unsaved.isDirty — boolean, true when local differs from persisted
 *   // unsaved.reset() — discard local changes, revert to persisted
 *
 * Performs a shallow comparison of top-level keys. For deep comparison,
 * pass a custom comparator as the third argument.
 */

import { SvelteSet } from 'svelte/reactivity';

export function useUnsavedChanges<T extends Record<string, unknown>>(
	getLocal: () => T,
	getPersisted: () => T,
	comparator?: (a: T, b: T) => boolean
) {
	const isDirty = $derived.by(() => {
		const local = getLocal();
		const persisted = getPersisted();

		if (comparator) {
			return !comparator(local, persisted);
		}

		const allKeys = new SvelteSet<string>();
		for (const key of Object.keys(local)) allKeys.add(key);
		for (const key of Object.keys(persisted)) allKeys.add(key);
		for (const key of allKeys) {
			if (local[key] !== persisted[key]) {
				return true;
			}
		}
		return false;
	});

	return {
		get isDirty(): boolean {
			return isDirty;
		}
	};
}
