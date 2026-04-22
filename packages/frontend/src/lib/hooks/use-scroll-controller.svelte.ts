/**
 * Hook for horizontal scroll containers with left/right navigation buttons
 * and auto-centering of target elements.
 *
 * Usage:
 *   const scroll = useScrollController();
 *   // In template: bind:this={scroll.container}
 *   // Buttons: onclick={scroll.scrollLeft}, onclick={scroll.scrollRight}
 *
 * Returns:
 *   container — bind this to the scrollable element
 *   canScrollLeft — reactive boolean
 *   canScrollRight — reactive boolean
 *   scrollLeft() — scroll left by SCROLL_AMOUNT_PX
 *   scrollRight() — scroll right by SCROLL_AMOUNT_PX
 *   scrollToCenter(element) — scroll to center a child element
 *   update() — recalculate scroll button state
 */

const SCROLL_AMOUNT_PX = 250;

export function useScrollController() {
	let container: HTMLDivElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function update() {
		if (!container) return;

		const { scrollLeft, scrollWidth, clientWidth } = container;
		canScrollLeft = scrollLeft > 0;
		canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;
	}

	function scrollLeft() {
		if (!container) return;
		container.scrollBy({ left: -SCROLL_AMOUNT_PX, behavior: 'smooth' });
	}

	function scrollRight() {
		if (!container) return;
		container.scrollBy({ left: SCROLL_AMOUNT_PX, behavior: 'smooth' });
	}

	function scrollToCenter(element: HTMLElement) {
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		const elementRect = element.getBoundingClientRect();

		const elementCenter = elementRect.left + elementRect.width / 2;
		const containerCenter = containerRect.left + containerRect.width / 2;
		const scrollOffset = elementCenter - containerCenter;

		container.scrollBy({ left: scrollOffset, behavior: 'smooth' });
	}

	$effect(() => {
		if (container) {
			update();
		}
	});

	return {
		get container(): HTMLDivElement | undefined {
			return container;
		},
		set container(value: HTMLDivElement | undefined) {
			container = value;
		},
		get canScrollLeft(): boolean {
			return canScrollLeft;
		},
		get canScrollRight(): boolean {
			return canScrollRight;
		},
		scrollLeft,
		scrollRight,
		scrollToCenter,
		update
	};
}
