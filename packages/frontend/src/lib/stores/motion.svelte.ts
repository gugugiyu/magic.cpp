/**
 * motionStore - Centralized animation timing derived from user settings
 *
 * Reads `animationSpeed` from settingsStore and provides duration values
 * for all UI transitions/animations. When speed is 'none', durations are 0
 * and the global `prefers-reduced-motion` media query is honored.
 */
import { AnimationSpeed } from '$lib/enums';
import { config } from '$lib/stores/settings.svelte';

const DURATION_MAP: Record<AnimationSpeed, { fast: number; base: number; slow: number }> = {
	[AnimationSpeed.NONE]: { fast: 0, base: 0, slow: 0 },
	[AnimationSpeed.SLOW]: { fast: 100, base: 200, slow: 350 },
	[AnimationSpeed.BASE]: { fast: 100, base: 200, slow: 300 },
	[AnimationSpeed.FAST]: { fast: 75, base: 150, slow: 250 }
};

function getSpeed() {
	const cfg = config();
	return (cfg.animationSpeed as AnimationSpeed) ?? AnimationSpeed.BASE;
}

class MotionStore {
	/**
	 * Whether any motion should run at all.
	 * Returns false when animationSpeed is 'none'.
	 */
	isMotionEnabled = $derived(getSpeed() !== AnimationSpeed.NONE);

	/**
	 * Quick micro-interactions (button press, hover color, chevron rotate)
	 */
	fast = $derived(DURATION_MAP[getSpeed()].fast);

	/**
	 * Standard UI transitions (fade, slide, fly on components)
	 */
	base = $derived(DURATION_MAP[getSpeed()].base);

	/**
	 * Slower structural transitions (sheet open, page-level fades)
	 */
	slow = $derived(DURATION_MAP[getSpeed()].slow);

	/**
	 * Svelte transition config factory — returns an object compatible
	 * with `in:`, `out:`, `transition:` directives. When motion is
	 * disabled the duration is 0 so the element appears instantly.
	 */
	fade = $derived((opts?: { duration?: number; delay?: number }) => ({
		duration: opts?.duration ?? this.base,
		delay: opts?.delay ?? 0
	}));

	fly = $derived((opts?: { y?: number; duration?: number; delay?: number }) => ({
		y: opts?.y ?? 8,
		duration: opts?.duration ?? this.base,
		delay: opts?.delay ?? 0
	}));

	slide = $derived((opts?: { duration?: number; delay?: number; axis?: 'x' | 'y' }) => ({
		duration: opts?.duration ?? this.base,
		delay: opts?.delay ?? 0,
		axis: opts?.axis ?? 'y'
	}));
}

export const motionStore = new MotionStore();
